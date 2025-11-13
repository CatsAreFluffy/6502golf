import React from "react";

import Machine from "./machine";
import MemoryView from "./memory_view";

function hex(value: number, length: number = 2): String {
    return value.toString(16).padStart(length, "0");
}

export default function MachineView({ machine: m }: {machine: Machine}) {
    const flags = [m.n, m.v, false, true, m.d, m.i, m.z, m.c];
    const names = "nv01dizc";
    let names2 = "";
    for(let i = 0; i < 8; i++) {
        if(flags[i]) {
            names2 += names[i].toUpperCase();
        } else {
            names2 += names[i];
        }
    }
    return (
        <div>
            Cycles: {m.cycles} <br />
            PC: {hex(m.pc, 4)} A: {hex(m.a)} X: {hex(m.x)} Y: {hex(m.y)} S: {hex(m.s)} P: {names2}
            <br />
            <MemoryView memory={m.memory} />
        </div>
    )
}