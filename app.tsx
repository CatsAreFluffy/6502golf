import React from "react";
import ReactCodeMirror from "@uiw/react-codemirror";

import { lex } from "./parser";

function App() {
    const onChange = React.useCallback((val, viewUpdate) => {
        console.log("val:", val);
        console.log("lex:", lex(val));
    }, [])
    return <ReactCodeMirror onChange={onChange}/>;
}
export default App;