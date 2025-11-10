import React from "react";
import ReactCodeMirror from "@uiw/react-codemirror";

import { lex, parse } from "./parser";

const default_code = `
 lda #$03
 sta 20`.replace("\n","");

function App() {
    const onChange = React.useCallback((val, viewUpdate) => {
        console.log("val:", val);
        let tokens = lex(val)
        console.log("lex:", tokens);
        try {
            console.log("parse:", parse(tokens));
        } catch(e) {
            console.error(e);
        }
    }, [])
    return <ReactCodeMirror value={default_code} onChange={onChange}/>;
}
export default App;