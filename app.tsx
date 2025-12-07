import React, { useState } from "react";
import ReactCodeMirror, { ViewUpdate } from "@uiw/react-codemirror";

import { lex, parse, ParseError } from "./parser";
import assemble from "./assembler";
import Machine from "./machine";
import MachineView from "./machine_view";
import { error_extension, error_field, set_error_field } from "./extension";
import { jams } from "./instructions";

const default_code = `
`.replace(/^\n|\n$/g,"");

function assemble_source(src: string): [Machine | undefined, [boolean, number, number]] {
    let new_error_state: [boolean, number, number] = [false, 0, 0];
    console.log("src:", src);
    let tokens = lex(src)
    console.log("lex:", tokens);
    try {
        let parse_tree = parse(tokens);
        console.log("parse:", parse_tree);
        let code = assemble(parse_tree);
        let machine = new Machine(code);
        return [machine, new_error_state];
    } catch(e) {
        if(e instanceof ParseError) {
            new_error_state = [true, e.token.position, e.token.position + e.token.token.length];
            console.error(e.token);
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

    const [machine, setMachine] = useState(
        () => {
            let [machine, error_state] = assemble_source(code);
            return machine ?? new Machine(new Array(65536).fill(0));
        }
    );

    const handleChange = React.useCallback((val: string, viewUpdate: ViewUpdate) => {
        localStorage.setItem("6502_golf_code", val);
        let [machine, error_state] = assemble_source(val);
        if(machine) {
            setMachine(machine);
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
        let i = 0;
        for(; i < 1000000; i++) {
            let opcode = new_machine.memory[new_machine.pc]
            if(!opcode || jams[opcode]) {
                break;
            }
            new_machine.step();
        }
        let millis = Date.now() - now;
        if(i > 0) {
            console.log("One step takes", (millis*1e6/i).toFixed(2), "ns");
            console.log("One cycle takes", (millis*1e6/(new_machine.cycles - machine.cycles)).toFixed(2), "ns");
        }
        if(!new_machine.memory[new_machine.pc]) {
            new_machine.pc = (new_machine.pc + 1) & 0xffff;
        }
        setMachine(new_machine);
    }

    return (
        <div className="app">
            <h1>6502 Golf</h1>
            <ReactCodeMirror className="editor" value={code} onChange={handleChange} extensions={[error_field, error_extension]}/>
            <button onClick={handleStep}>Step</button>
            <button onClick={handleRunToJump}>Run until backwards jump</button>
            <button onClick={handleRunToBrk}>Run until BRK</button>
            <MachineView machine={machine} />
        </div>
    );
}
export default App;