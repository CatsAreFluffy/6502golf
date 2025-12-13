import React, { useMemo, useState } from "react";
import ReactCodeMirror, { ViewUpdate } from "@uiw/react-codemirror";

import { lex, LocatedError, parse } from "./parser.ts";
import assemble from "./assembler.ts";
import Machine from "./machine.ts";
import MachineView from "./machine_view.tsx";
import { error_extension, error_field, set_error_field } from "./extension.ts";
import { jams } from "./instructions.ts";
import challenges from "./challenges.ts";
import OutputView from "./output_view.tsx";
import { judge } from "./judge.ts";
import { SubmitRequest, SubmitResponse } from "./api_types.ts";

const default_code = `
`.replace(/^\n|\n$/g,"");

function assemble_source(src: string): [Machine | undefined, [boolean, number, number]] {
    let new_error_state: [boolean, number, number] = [false, 0, 0];
    console.log("src:", src);
    try {
        let tokens = lex(src)
        console.log("lex:", tokens);
        let parse_tree = parse(tokens);
        console.log("parse:", parse_tree);
        let code = assemble(parse_tree);
        let machine = new Machine(code);
        return [machine, new_error_state];
    } catch(e) {
        if(e instanceof LocatedError) {
            new_error_state = [true, e.start, e.end];
            console.log(src.slice(e.start, e.end));
        }
        console.error(e);
    }
    return [undefined, new_error_state];
}

function App() {
    let code = default_code;
    let local_code = localStorage.getItem("6502_golf_code");
    if(local_code) {
        code = local_code;
    }

    const [challenge_name, setChallengeName] = useState(
        () => challenges.keys().next().value!
    )
    
    const current_challenge = challenges.get(challenge_name)!;

    const handleSelectChallenge = (challenge: string) => () => {
        setChallengeName(challenge);
    }

    const challenge_buttons = [];
    for(let challenge of challenges.keys()) {
        challenge_buttons.push(<button key={challenge} onClick={handleSelectChallenge(challenge)}>{challenge}</button>);
    }

    const [base_machine, setBaseMachine] = useState(
        () => {
            let [machine, error_state] = assemble_source(code);
            return machine ?? new Machine(new Array(65536).fill(0));
        }
    );

    const bytes = useMemo(() => base_machine.nz_bytes(), [base_machine]);

    const [machine, setMachine] = useState(() => base_machine);

    const [judgment, setJudgment] = useState(() => "");

    const handleChange = React.useCallback((val: string, viewUpdate: ViewUpdate) => {
        localStorage.setItem("6502_golf_code", val);
        let [machine, error_state] = assemble_source(val);
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
        let new_machine = machine.clone();
        new_machine.step();
        setMachine(new_machine);
    }

    const handleRunToJump = () => {
        let new_machine = machine.clone();
        let last_pc = -1;
        while(last_pc < new_machine.pc) {
            last_pc = new_machine.pc;
            new_machine.step();
        }
        setMachine(new_machine);
    }

    const handleRunToBrk = () => {
        let new_machine = machine.clone();
        let now = Date.now();
        for(let i = 0; i < 1000000; i++) {
            let opcode = new_machine.memory[new_machine.pc]
            if(!opcode || jams[opcode]) {
                break;
            }
            new_machine.step();
        }
        let millis = Date.now() - now;
        if(new_machine.instructions > machine.instructions) {
            console.log("One step takes", (millis*1e6/(new_machine.instructions - machine.instructions)).toFixed(2), "ns");
            console.log("One cycle takes", (millis*1e6/(new_machine.cycles - machine.cycles)).toFixed(2), "ns");
        }
        if(!new_machine.memory[new_machine.pc]) {
            new_machine.pc = (new_machine.pc + 1) & 0xffff;
        }
        setMachine(new_machine);
    }

    let expected_output_bytes = useMemo(() => current_challenge.output(), [challenge_name]);

    const handleRunToEnd = () => {
        let new_machine = machine.clone();
        let now = Date.now();
        new_machine.run_until_jam(1 << 30);
        let millis = Date.now() - now;
        if(new_machine.instructions > machine.instructions) {
            console.log("One step takes", (millis*1e6/(new_machine.instructions - machine.instructions)).toFixed(2), "ns");
            console.log("One cycle takes", (millis*1e6/(new_machine.cycles - machine.cycles)).toFixed(2), "ns");
        }
        setMachine(new_machine);
        if(jams[new_machine.memory[new_machine.pc]]) {
            let pass = judge(new_machine, current_challenge);
            if(pass) {
                setJudgment(` (passed in ${new_machine.cycles} cycles)`);
            } else {
                setJudgment(` (failed)`);
            }
        }
    }

    let [submit_judgment, setSubmitJudgment] = useState(() => "");

    const handleSubmit = async () => {
        setSubmitJudgment("...");
        let memory = base_machine.serialize_memory();
        let request: SubmitRequest = {challenge_name, memory};
        let response = await fetch("/submit",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            }
        );
        let body: SubmitResponse = await response.json();
        let {pass, message} = body;
        if(pass) {
            setSubmitJudgment(`Passed!`);
        } else {
            setSubmitJudgment(`Failed (${message})`);
        }
    }

    return (
        <div className="app">
            <h1>6502 Golf</h1>
            <div>Challenges: {challenge_buttons}</div>
            <b>{challenge_name}</b>: {current_challenge.description}<br />
            {bytes} byte{bytes == 1?"":"s"}{judgment}
            <ReactCodeMirror className="editor" value={code} onChange={handleChange} extensions={[error_field, error_extension]}/>
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