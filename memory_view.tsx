import React, { ReactElement } from "react";

function MemoryLine({ memory, index, length }: {memory: number[], index: number, length: number}): ReactElement {
    let ret = [<td key={-1}>{index.toString(16).padStart(4, "0")}:</td>];
    for(let i = 0; i < length; i++) {
        ret.push(<td key={i}>{memory[index + i].toString(16).padStart(2, "0")}</td>);
    }
    return <tr key={index}>{ret}</tr>;
}

export default function MemoryView({ memory }: {memory: number[]}) {
    let top_line = [<td key={-1}></td>];
    let length = 32;
    for(let i = 0; i < length; i++) {
        top_line.push(<td key={i}>{i.toString(16).padStart(2, "0")}</td>);
    }
    let ret = [<tr key={-1}>{top_line}</tr>];
    for(let i = 0; i + length - 1 < memory.length; i += length) {
        let nonzero = false;
        for(let j = 0; j < length; j++) {
            if(memory[i + j]) {
                nonzero = true;
                break;
            }
        }
        if(!nonzero) {
            continue;
        }
        ret.push(<MemoryLine memory={memory} index={i} length={length} />);
    }
    return <table><tbody>{ret}</tbody></table>;
}