import React, { useState } from "react";
import ReactCodeMirror, { ViewUpdate } from "@uiw/react-codemirror";

import { lex, parse } from "./parser";
import assemble from "./assembler";
import Machine from "./machine";
import MachineView from "./machine_view";

const default_code = `
 org $fffc
 dc.w $8000
 org $8000
 lda $fffc
 sta $fffe
 lda $fffd
 sta $ffff
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