import React, { ReactElement, useContext } from "react";
import { MemoryRange } from "./machine";
import { RangeContext } from "./range_context";

function MemoryLine({ memory, index, length }: {memory: number[], index: number, length: number}): ReactElement {
    const [last_instruction, last_data] = useContext(RangeContext);
    let ret = [];
    for(let i = 0; i < length; i++) {
        let cell_index = index + i;
        let class_name = "";
        if(last_instruction.includes(cell_index)) {
            class_name = "last-instruction";
        }
        if(last_data.includes(cell_index)) {
            class_name = "last-data";
        }
        let cell = <td key={i} className={class_name}>{memory[cell_index].toString(16).padStart(2, "0")}</td>;
        ret.push(cell);
    }
    return <tr key={index}><td>{index.toString(16).padStart(4, "0")}:</td>{ret}</tr>;
}

export default function MemoryView({ memory }: {memory: number[]}) {
    const [last_instruction, last_data] = useContext(RangeContext);
    let top_line = [];
    let length = 32;
    for(let i = 0; i < length; i++) {
        top_line.push(<td key={i}>{i.toString(16).padStart(2, "0")}</td>);
    }
    let ret = [];
    for(let i = 0; i + length - 1 < memory.length; i += length) {
        let line_range = new MemoryRange(i, i + length);
        if(!last_instruction.overlaps(line_range) && !last_data.overlaps(line_range)) {
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
        }
        ret.push(<MemoryLine key={i} memory={memory} index={i} length={length}/>);
    }
    return <table><tbody><tr><td></td>{top_line}</tr>{ret}</tbody></table>;
}