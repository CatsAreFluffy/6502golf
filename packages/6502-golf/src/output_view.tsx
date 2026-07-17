import React from "react";

export default function OutputView({ data }: {data: number[]}) {
    let line = "";
    const tags = [];
    for(const i of data) {
        if(!i) {
            break;
        } else if(i == 0x0a) {
            tags.push(line, <br key={tags.length + 1} />);
            line = "";
        } else if(i < 0x20 || i >= 0x7f) {
            line += "�";
        } else {
            line += String.fromCharCode(i);
        }
    }
    if(line.length) {
        tags.push(line);
    }
    return <div className="output-view">{tags}</div>;
}