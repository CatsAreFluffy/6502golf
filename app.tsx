import React, { useState } from "react";
import ReactCodeMirror, { ViewUpdate } from "@uiw/react-codemirror";

import { lex, parse } from "./parser";
import assemble from "./assembler";
import Machine from "./machine";
import MachineView from "./machine_view";

const default_code = `
 org 0
fillcntl byte 0
fillcnth byte 0
 org $0400
mul10l
 org $0500
mul10h
 org $0200
fill
 sta mul10l,x
 sta fillcntl
 lda fillcnth
 adc #0
 sta mul10h,x
 sta fillcnth
 lda fillcntl
 clc
 adc #10
 inx
 bne fill
`.replace(/^\n|\n$/g,"");

function assemble_source(src: string): Machine | undefined {
        console.log("src:", src);
        let tokens = lex(src)
        console.log("lex:", tokens);
        try {
            let parse_tree = parse(tokens);
            console.log("parse:", parse_tree);
            let code = assemble(parse_tree);
            return new Machine(code);
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

    return (
        <>
            <ReactCodeMirror value={default_code} onChange={handleChange}/>
            <button onClick={handleStep}>Step</button>
            <MachineView machine={machine} />
        </>
    );
}
export default App;