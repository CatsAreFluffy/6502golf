import React, { useState } from "react";
import ReactCodeMirror from "@uiw/react-codemirror";

import { lex, parse } from "./parser";
import assemble from "./assembler";
import MemoryView from "./memory_view";

const default_code = `
 lda #$03
 sta 20`.replace("\n","");

function App() {
    const [memory, setMemory] = useState<number[]>([]);

    const onChange = React.useCallback((val, viewUpdate) => {
        console.log("val:", val);
        let tokens = lex(val)
        console.log("lex:", tokens);
        try {
            let parse_tree = parse(tokens);
            console.log("parse:", parse_tree);
            let code = assemble(parse_tree);
            setMemory(code);
        } catch(e) {
            console.error(e);
        }
    }, [])
    return (
        <>
            <ReactCodeMirror value={default_code} onChange={onChange}/>
            <MemoryView memory={memory} />
        </>
    );
}
export default App;