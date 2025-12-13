import React from "react";

import Machine from "./machine.ts";
import MemoryView from "./memory_view.tsx";
import { RangeContext } from "./range_context.ts";

function hex(value: number, length: number = 2): String {
    return value.toString(16).padStart(length, "0");
}

export default function MachineView({ machine: m }: {machine: Machine}) {
    const flags = [m.n, m.v, true, true, m.d, m.i, m.z, m.c];
    const names = "nv1bdizc";
    let names2 = "";
    for(let i = 0; i < 8; i++) {
        if(flags[i]) {
            names2 += names[i].toUpperCase();
        } else {
            names2 += names[i];
        }
    }
    return (
        <div className="viewer">
            Cycles: {m.cycles} <br />
            PC: {hex(m.pc, 4)} A: {hex(m.a)} X: {hex(m.x)} Y: {hex(m.y)} S: {hex(m.s)} P: {names2}
            <br />
            <RangeContext value={m.last_access_map()}>
                <MemoryView memory={m.memory} />
            </RangeContext>
        </div>
    )
}