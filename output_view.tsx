import React from "react";

export default function OutputView({ data }: {data: number[]}) {
    let line = "";
    const tags = [];
    for(let i of data) {
        if(!i) {
            break;
        } else if(i == 0x0a) {
            tags.push(<text key={tags.length}>{line}</text>, <br key={tags.length + 1} />);
            line = "";
        } else if(i < 0x20 || i >= 0x7f) {
            line += "�";
        } else {
            line += String.fromCharCode(i);
        }
    }
    if(line.length) {
        tags.push(<text key={tags.length}>{line}</text>);
    }
    return <div className="output-view">{tags}</div>;
}