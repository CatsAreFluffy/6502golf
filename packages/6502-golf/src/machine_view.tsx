import React from "react";

import { AccessType, Machine } from "fluffy-6502";
import MemoryView from "./memory_view.tsx";
import { RangeContext } from "./range_context.ts";

function hex(value: number, length: number = 2): string {
    return value.toString(16).padStart(length, "0");
}

export default function MachineView({ machine: m, editor_line_targets }: {machine: Machine, editor_line_targets: number[]}) {
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
    const highlights: Map<number, AccessType | "editor"> = m.last_access_map();
    for(const i of editor_line_targets) {
        if(!highlights.has(i)) {
            highlights.set(i, "editor");
        }
    }
    return (
        <div className="viewer">
            Cycles: {m.cycles} <br />
            PC: {hex(m.pc, 4)} A: {hex(m.a)} X: {hex(m.x)} Y: {hex(m.y)} S: {hex(m.s)} P: {names2}
            <br />
            <RangeContext value={highlights}>
                <MemoryView memory={m.memory} />
            </RangeContext>
        </div>
    );
}