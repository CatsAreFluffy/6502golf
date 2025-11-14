import React, { useState } from "react";
import ReactCodeMirror, { ViewUpdate } from "@uiw/react-codemirror";

import { lex, parse } from "./parser";
import assemble from "./assembler";
import Machine from "./machine";
import MachineView from "./machine_view";

const default_code = `
`.replace(/^\n|\n$/g,"");

function assemble_source(src: string): Machine | undefined {
    console.log("src:", src);
    let tokens = lex(src)
    console.log("lex:", tokens);
    try {
        let parse_tree = parse(tokens);
        console.log("parse:", parse_tree);
        let code = assemble(parse_tree);
        let machine = new Machine(code);
        return machine;
    } catch(e) {
        console.error(e);
    }
}

function App() {
    const [machine, setMachine] = useState(
        () => assemble_source(default_code) ?? new Machine(new Array(65536).fill(0))
    );

    const handleChange = React.useCallback((val: string, viewUpdate: ViewUpdate) => {
        let machine = assemble_source(val);
        if(machine) {
            setMachine(machine);
        }
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
            if(!new_machine.memory[new_machine.pc]) {
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
        <>
            <ReactCodeMirror value={default_code} onChange={handleChange}/>
            <button onClick={handleStep}>Step</button>
            <button onClick={handleRunToJump}>Run until backwards jump</button>
            <button onClick={handleRunToBrk}>Run until BRK</button>
            <MachineView machine={machine} />
        </>
    );
}
export default App;