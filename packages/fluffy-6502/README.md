# fluffy-6502

This package implements a 6502 assembler and emulator.

    import { assemble, Machine } from "fluffy-6502"
    let { memory, sources } = assemble(" lda #$2a")
    let machine = new Machine(memory)
    machine.step()
    console.log(machine.a) // 42