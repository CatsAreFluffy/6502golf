import React, { useState } from "react";
import ReactCodeMirror from "@uiw/react-codemirror";

import { lex, parse } from "./parser";
import assemble from "./assembler";
import Machine from "./machine";
import MachineView from "./machine_view";

const default_code = `
 lda #$03
 sta 20`.replace("\n","");

function App() {
    const [machine, setMachine] = useState(new Machine(new Array(65536).fill(0)));

    const handleChange = React.useCallback((val, viewUpdate) => {
        console.log("val:", val);
        let tokens = lex(val)
        console.log("lex:", tokens);
        try {
            let parse_tree = parse(tokens);
            console.log("parse:", parse_tree);
            let code = assemble(parse_tree);
            setMachine(new Machine(code));
        } catch(e) {
            console.error(e);
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