import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactCodeMirror, { ReactCodeMirrorRef, ViewUpdate } from "@uiw/react-codemirror";

import { assemble, jams, Machine, LocatedError } from "fluffy-6502";
import MachineView from "./machine_view.tsx";
import { access_highlight_extension, access_highlight_field, AccessInfo, error_extension, error_field, error_tooltip, ErrorInfo, set_access_highlight_field, set_error_field } from "./extensions.ts";
import challenges from "./challenges.ts";
import OutputView from "./output_view.tsx";
import { judge } from "./judge.ts";
import { SubmitRequest, SubmitResponse } from "./api_types.ts";
import ByteCount from "./byte_count.tsx";
import { serialize_memory } from "./serialize.ts";

const default_code = `
 ; Welcome to 6502 Golf!
 ; Programs here are written in 6502 assembly.
 ; If you're unfamiliar with that, this page has good descriptions of every
 ; instruction: https://www.masswerk.at/6502/6502_instruction_set.html
 ; So, for example, here's a program that computes 12+34.
 ; (I recommend single-stepping using the Step button below.)
 lda #12
 clc
 adc #34
 ; The state of the processor and memory is shown below the editor.
 ; Right now (after stepping 3 times), the A register is 2e, or in decimal, 46,
 ; which is what you'd expect from 12+34.

 ; Labels always appear at the beginning of a line, and conversely instructions
 ; and other directives must always be indented. Colons after labels are optional.
 ; So, here's a program that computes multiples of 3:
 lda #0
 ldx #0
multiples_of_3
 sta $1000,x
 inx
 clc
 adc #3
 bcc multiples_of_3

 ; The memory view below shows the bytes the last instruction accessed. Red bytes
 ; are opcodes and operand addresses, and blue bytes are the operands themselves.
 ; There's also green for pointers in indirect modes, and gray for unused bytes.
 ldx #1
 jmp 0
 org 0
 ; The following instruction shows all of those at once.
 lda (2,x)
 rts
 word 5
 byte $42
 ; You can also see accesses in the editor. Right now, the above four lines should
 ; be highlighted in each of the four colors.

 ; Get back on track. Execution continues at line 64.
 org $100
 word $300-1

 ; The directives supported by the assembler are org (which sets which location in
 ; memory to assemble to), byte, word, ds.b, ds.w (which output constant bytes or
 ; words), res.b, res.w, dc.b, dc.w (which reserve some amount of memory), and equ
 ; or = (which set a label to a given value).
 org $20
mul_in_1 equ 21
mul_in_2 = 5
mul_out res.b 1

 ; The bytecount used for scoring doesn't count zero bytes. So, the following doesn't
 ; affect it at all.
 word 0
 byte 0
 res.w 0

 ; Execution starts from the reset vector stored at $fffc, which defaults to
 ; $0200. If you want to start from a different location, put some other address
 ; there. (This program uses the default location, so the following isn't strictly
 ; necessary.)
 org $fffc
 word $0200

 ; You can enter numbers in different bases using $ or 0x for hexadecimal (which
 ; I've already done a few times above), 0o for octal, or 0b for binary.
 org $300
 lda #99
 cmp #$63
 bne fail
 cmp #0o143
 bne fail
 cmp #0b01100011
 bne fail
 jmp pass
fail
 jam
pass

 ; The usual operators (+-*/%&^|~ and shifts) are supported. Since parentheses are
 ; used for the indirect modes, use brackets for grouping. Currently, all operators
 ; have the same precedence. I might change that later.
 lda 16*65/2-[3+1]
 eor #$22

 ; You can also use < and > to get the first and second bytes of a value respectively.
 lda #<target
 sta $fffe
 lda #>target
 sta $ffff
 brk
target

 ; To use zeropage addressing modes, add a z at the end of the instruction name.
 lda #0
 ldx #mul_in_2
multiply
 clc
 adc #mul_in_1
 dex
 bne multiply
 staz mul_out

 ; All illegal opcodes are supported, using the mnemonics from the page above.
illegal_output_1 equ $fe00
illegal_output_2 equ $fe20
 lxa #$aa
 sha illegal_output_1,y
 sax illegal_output_2
illegal_loop
 iny
 sbx #1
 shx illegal_output_1,y
 tas illegal_output_2,y
 dcp $103e
 bne illegal_loop

 ; Terminate your program with the "jam" instruction.
 jam
`.replace(/^\n|\n$/g,"");

function assemble_source(src: string): [Machine | undefined, Map<number, [number, number]> | undefined, ErrorInfo] {
    let new_error_state: ErrorInfo = {valid: false};
    console.log("src:", src);
    try {
        const {memory, sources} = assemble(src);
        const machine = new Machine(memory);
        return [machine, sources, new_error_state];
    } catch(e) {
        if(e instanceof LocatedError) {
            new_error_state = {
                valid: true,
                start: e.start,
                end: e.end,
                message: e.message,
            };
            console.log(src.slice(e.start, e.end));
        }
        console.error(e);
    }
    return [undefined, undefined, new_error_state];
}

function App() {
    const [username, setUsername] = useState(
        () => {
            const saved_username = localStorage.getItem("6502_golf_username");
            if(saved_username) {
                return saved_username;
            }
            return "";
        }
    );

    const handleChangeUsername = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        const username = e.target.value;
        localStorage.setItem("6502_golf_username", username);
        setUsername(username);
    }, []);

    const [code, setCode] = useState(
        () => {
            const local_code = localStorage.getItem("6502_golf_code");
            if(local_code) {
                return local_code;
            }
            return default_code;
        }
    );

    const editor_ref = useRef<ReactCodeMirrorRef | null>(null);

    const [challenge_name, setChallengeName] = useState(
        () => {
            const saved_challenge_name = localStorage.getItem("6502_golf_challenge");
            if(saved_challenge_name && challenges.has(saved_challenge_name)) {
                return saved_challenge_name;
            }
            return challenges.keys().next().value!;
        }
    );
    
    const current_challenge = challenges.get(challenge_name)!;

    const handleSelectChallenge = (challenge_name: string) => () => {
        localStorage.setItem("6502_golf_challenge", challenge_name);
        setChallengeName(challenge_name);
    };

    const challenge_buttons = [];
    for(const challenge of challenges.keys()) {
        challenge_buttons.push(<button key={challenge} onClick={handleSelectChallenge(challenge)}>{challenge}</button>);
    }

    const [error_info, setErrorInfo] = useState<ErrorInfo>(
        () => ({valid: false})
    );

    const [sources, setSources] = useState<Map<number, [number, number]>>(
        () => new Map()
    );

    const [base_machine, setBaseMachine] = useState(
        () => {
            const [machine, sources, error_state] = assemble_source(code);
            if(sources){
                setSources(sources);
            }
            setErrorInfo(error_state);
            return machine ?? new Machine(new Array(65536).fill(0));
        }
    );

    const bytes = useMemo(() => base_machine.nz_bytes(), [base_machine]);

    const [machine, setMachine] = useState(() => base_machine);

    const [judgment, setJudgment] = useState(() => "");

    const handleChange = React.useCallback((val: string, _viewUpdate: ViewUpdate) => {
        localStorage.setItem("6502_golf_code", val);
        setCode(val);
        const [machine, sources, error_state] = assemble_source(val);
        if(machine) {
            setBaseMachine(machine);
            setMachine(machine);
            setSources(sources!);
        }
        setErrorInfo(error_state);
        setJudgment("");
    }, []);

    const handleReset = () => {
        setMachine(base_machine);
        setJudgment("");
    };

    const handleStep = () => {
        const new_machine = machine.clone();
        new_machine.step();
        setMachine(new_machine);
    };

    const handleRunToJump = () => {
        const new_machine = machine.clone();
        let last_pc = -1;
        while(last_pc < new_machine.pc) {
            last_pc = new_machine.pc;
            new_machine.step();
        }
        setMachine(new_machine);
    };

    const handleRunToBrk = () => {
        const new_machine = machine.clone();
        const now = Date.now();
        for(let i = 0; i < 1000000; i++) {
            const opcode = new_machine.memory[new_machine.pc];
            if(!opcode || jams[opcode]) {
                break;
            }
            new_machine.step();
        }
        const millis = Date.now() - now;
        if(new_machine.instructions > machine.instructions) {
            console.log("One step takes", (millis*1e6/(new_machine.instructions - machine.instructions)).toFixed(2), "ns");
            console.log("One cycle takes", (millis*1e6/(new_machine.cycles - machine.cycles)).toFixed(2), "ns");
        }
        if(!new_machine.memory[new_machine.pc]) {
            new_machine.pc = (new_machine.pc + 1) & 0xffff;
        }
        setMachine(new_machine);
    };

    const expected_output_bytes = useMemo(() => current_challenge.output(), [challenge_name]);

    const handleRunToEnd = () => {
        const new_machine = machine.clone();
        const now = Date.now();
        new_machine.run_until_jam(1 << 30);
        const millis = Date.now() - now;
        if(new_machine.instructions > machine.instructions) {
            console.log("One step takes", (millis*1e6/(new_machine.instructions - machine.instructions)).toFixed(2), "ns");
            console.log("One cycle takes", (millis*1e6/(new_machine.cycles - machine.cycles)).toFixed(2), "ns");
        }
        setMachine(new_machine);
        if(jams[new_machine.memory[new_machine.pc]]) {
            const pass = judge(new_machine.memory, current_challenge);
            if(pass) {
                setJudgment(` (passed in ${new_machine.cycles} cycles)`);
            } else {
                setJudgment(` (failed)`);
            }
        }
    };

    const [submit_judgment, setSubmitJudgment] = useState(() => "");

    const handleSubmit = async () => {
        setSubmitJudgment("...");
        const memory = serialize_memory(base_machine);
        const request: SubmitRequest = {username, challenge_name, memory};
        try {
            const response = await fetch("/submit",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(request),
                }
            );
            const body: SubmitResponse = await response.json();
            const {pass, message} = body;
            if(pass) {
                setSubmitJudgment(`Passed!`);
            } else {
                setSubmitJudgment(`Failed (${message})`);
            }
        } catch(e) {
            console.error(e);
            setSubmitJudgment("Error");
        }
    };

    const access_locations: AccessInfo[] = useMemo(() => {
        if(error_info.valid) {
            return [];
        }
        const access_locations: AccessInfo[] = [];
        for(const [address, access_type] of machine.last_access_map()) {
            const source = sources.get(address);
            if(source === undefined) {
                continue;
            }
            access_locations.push({
                start: source[0],
                end: source[1],
                kind: access_type,
            });
        }
        access_locations.sort((a, b) => a.start - b.start);
        return access_locations;
    }, [machine, error_info.valid]);

    useEffect(() => {
        const view = editor_ref.current?.view;
        if(view !== undefined) {
            console.log("dispatch");
            view.dispatch({
                effects: [
                    set_error_field.of(error_info),
                    set_access_highlight_field.of(access_locations)
                ],
            });
        }
    }, [error_info, access_locations]);

    const extensions = [
        error_field.init(() => error_info),
        error_extension,
        error_tooltip,
        access_highlight_field.init(() => access_locations),
        access_highlight_extension
    ];

    return (
        <div className="app">
            <h1>6502 Golf</h1>
            Output is read as ASCII from 0x8000, ending at a null byte. Use the <span className="viewer">jam</span> instruction to end your program.<br />
            Solutions are not saved. Keep copies elsewhere.
            <div>Name for leaderboard: <input value={username} onChange={handleChangeUsername}/></div>
            <a href="/leaderboard.html">View leaderboard</a>
            <div>Challenges: {challenge_buttons}</div>
            <b>{challenge_name}</b>: {current_challenge.description}<br />
            <ByteCount bytes={bytes} valid={!error_info.valid} />{judgment}
            <ReactCodeMirror ref={editor_ref} className="editor" value={code} onChange={handleChange} extensions={extensions}/>
            <button onClick={handleReset}>Reset</button>
            <button onClick={handleStep}>Step</button>
            <button onClick={handleRunToJump}>Run until backwards jump</button>
            <button onClick={handleRunToBrk}>Run until BRK</button>
            <button onClick={handleRunToEnd}>Run until end</button>
            <button onClick={handleSubmit}>Submit</button> {submit_judgment}
            <MachineView machine={machine} />
            Current output:
            <OutputView data={machine.memory.slice(0x8000)} />
            Expected output:
            <OutputView data={expected_output_bytes} />
        </div>
    );
}
export default App;