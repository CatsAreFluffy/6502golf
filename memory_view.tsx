import React, { ReactElement, useContext } from "react";
import { AccessType } from "./machine.ts";
import { RangeContext } from "./range_context.ts";

function MemoryLine({ memory, index, length }: {memory: number[], index: number, length: number}): ReactElement {
    const last_accesses = useContext(RangeContext);
    let ret = [];
    for(let i = 0; i < length; i++) {
        let cell_index = index + i;
        let class_name = "";
        let access_type = last_accesses.get(cell_index);
        if(access_type !== undefined) {
            class_name = "last-" + access_type;
        }
        let cell = <td key={i} className={class_name}>{memory[cell_index].toString(16).padStart(2, "0")}</td>;
        ret.push(cell);
    }
    return <tr key={index}><td>{index.toString(16).padStart(4, "0")}:</td>{ret}</tr>;
}

export default function MemoryView({ memory }: {memory: number[]}) {
    const last_accesses = useContext(RangeContext);
    let top_line = [];
    let length = 32;
    for(let i = 0; i < length; i++) {
        top_line.push(<td key={i}>{i.toString(16).padStart(2, "0")}</td>);
    }
    let ret = [];
    for(let i = 0; i + length - 1 < memory.length; i += length) {
        let interesting = false;
        for(let j = 0; j < length; j++) {
            if(memory[i + j] || last_accesses.has(i + j)) {
                interesting = true;
                break;
            }
        }
        if(interesting) {
            ret.push(<MemoryLine key={i} memory={memory} index={i} length={length}/>);
        }
    }
    return <table><tbody><tr><td></td>{top_line}</tr>{ret}</tbody></table>;
}