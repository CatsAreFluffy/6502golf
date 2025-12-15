import React, { useMemo, useRef, useState } from "react";
import ReactCodeMirror, { ReactCodeMirrorRef, ViewUpdate } from "@uiw/react-codemirror";

import { lex, LocatedError, parse } from "./parser.ts";
import assemble from "./assembler.ts";
import Machine from "./machine.ts";
import MachineView from "./machine_view.tsx";
import { access_highlight_extension, access_highlight_field, AccessInfo, error_extension, error_field, error_tooltip, ErrorInfo, set_access_highlight_field, set_error_field } from "./extensions.ts";
import { jams } from "./instructions.ts";
import challenges from "./challenges.ts";
import OutputView from "./output_view.tsx";
import { judge } from "./judge.ts";
import { SubmitRequest, SubmitResponse } from "./api_types.ts";

const default_code = `
`.replace(/^\n|\n$/g,"");

function assemble_source(src: string): [Machine | undefined, ErrorInfo] {
    let new_error_state: ErrorInfo = {valid: false};
    console.log("src:", src);
    try {
        const tokens = lex(src)
        console.log("lex:", tokens);
        const parse_tree = parse(tokens);
        console.log("parse:", parse_tree);
        const {memory, sources} = assemble(parse_tree);
        const machine = new Machine(memory, sources);
        return [machine, new_error_state];
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
    return [undefined, new_error_state];
}

function App() {
    let code = default_code;
    const local_code = localStorage.getItem("6502_golf_code");
    if(local_code) {
        code = local_code;
    }

    const editor_ref = useRef<ReactCodeMirrorRef | null>(null);

    const [challenge_name, setChallengeName] = useState(
        () => challenges.keys().next().value!
    )
    
    const current_challenge = challenges.get(challenge_name)!;

    const handleSelectChallenge = (challenge: string) => () => {
        setChallengeName(challenge);
    }

    const challenge_buttons = [];
    for(const challenge of challenges.keys()) {
        challenge_buttons.push(<button key={challenge} onClick={handleSelectChallenge(challenge)}>{challenge}</button>);
    }

    const [base_machine, setBaseMachine] = useState(
        () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [machine, error_state] = assemble_source(code);
            return machine ?? new Machine(new Array(65536).fill(0));
        }
    );

    const bytes = useMemo(() => base_machine.nz_bytes(), [base_machine]);

    const [machine, setMachine] = useState(() => base_machine);

    const [judgment, setJudgment] = useState(() => "");

    const handleChange = React.useCallback((val: string, viewUpdate: ViewUpdate) => {
        localStorage.setItem("6502_golf_code", val);
        const [machine, error_state] = assemble_source(val);
        if(machine) {
            setBaseMachine(machine);
            setMachine(machine);
            setJudgment("");
        }
        viewUpdate.view.dispatch({
            effects: [set_error_field.of(error_state)],
        });
    }, []);

    const handleStep = () => {
        const new_machine = machine.clone();
        new_machine.step();
        setMachine(new_machine);
    }

    const handleRunToJump = () => {
        const new_machine = machine.clone();
        let last_pc = -1;
        while(last_pc < new_machine.pc) {
            last_pc = new_machine.pc;
            new_machine.step();
        }
        setMachine(new_machine);
    }

    const handleRunToBrk = () => {
        const new_machine = machine.clone();
        const now = Date.now();
        for(let i = 0; i < 1000000; i++) {
            const opcode = new_machine.memory[new_machine.pc]
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
    }

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
            const pass = judge(new_machine, current_challenge);
            if(pass) {
                setJudgment(` (passed in ${new_machine.cycles} cycles)`);
            } else {
                setJudgment(` (failed)`);
            }
        }
    }

    const [submit_judgment, setSubmitJudgment] = useState(() => "");

    const handleSubmit = async () => {
        setSubmitJudgment("...");
        const memory = base_machine.serialize_memory();
        const request: SubmitRequest = {challenge_name, memory};
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
    }

    const access_locations: AccessInfo[] = useMemo(() => {
        const access_locations: AccessInfo[] = [];
        for(const [address, access_type] of machine.last_access_map()) {
            const source = machine.sources.get(address);
            if(source === undefined) {
                continue;
            }
            access_locations.push({
                start: source[0],
                end: source[1],
                kind: access_type,
            });
        }
        return access_locations;
    }, [machine]);

    const view = editor_ref.current?.view;
    if(view !== undefined) {
        view.dispatch({
            effects: [set_access_highlight_field.of(access_locations)],
        });
    }

    const extensions = [
        error_field,
        error_extension,
        error_tooltip,
        access_highlight_field,
        access_highlight_extension
    ];

    return (
        <div className="app">
            <h1>6502 Golf</h1>
            <div>Challenges: {challenge_buttons}</div>
            <b>{challenge_name}</b>: {current_challenge.description}<br />
            {bytes} byte{bytes == 1?"":"s"}{judgment}
            <ReactCodeMirror ref={editor_ref} className="editor" value={code} onChange={handleChange} extensions={extensions}/>
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