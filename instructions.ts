const imp = "implicit";
const imm = "immediate";
const zpg = "zeropage";
const zpx = "zeropage,x";
const zpy = "zeropage,y";
const rel = "relative";
const abs = "absolute";
const abx = "absolute,x";
const axf = "absolute,x fast";
const aby = "absolute,y";
const ayf = "absolute,y fast";
const ind = "indirect";
const inx = "indirect,x";
const iny = "indirect,y";
const iyf = "indirect,y fast";

export type ParseAddressingMode = "implicit" | "immediate" | "absolute" | "absolute,x" | "absolute,y" | "indirect" | "indirect,x" | "indirect,y";
export type AssembleAddressingMode = ParseAddressingMode | "zeropage" | "zeropage,x" | "zeropage,y" | "relative";
export type AddressingMode = AssembleAddressingMode | "absolute,x fast" | "absolute,y fast" | "indirect,y fast";
export const modes: AddressingMode[] = [
    imp, inx, imp, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  abs, abs, abs, abs,
    rel, iyf, imp, iny,  zpx, zpx, zpx, zpx,  imp, ayf, imp, aby,  axf, axf, abx, abx,
    abs, inx, imp, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  abs, abs, abs, abs,
    rel, iyf, imp, iny,  zpx, zpx, zpx, zpx,  imp, ayf, imp, aby,  axf, axf, abx, abx,

    imp, inx, imp, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  abs, abs, abs, abs,
    rel, iyf, imp, iny,  zpx, zpx, zpx, zpx,  imp, ayf, imp, aby,  axf, axf, abx, abx,
    imp, inx, imp, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  ind, abs, abs, abs,
    rel, iyf, imp, iny,  zpx, zpx, zpx, zpx,  imp, ayf, imp, aby,  axf, axf, abx, abx,

    imm, inx, imm, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  abs, abs, abs, abs,
    rel, iny, imp, iny,  zpx, zpx, zpy, zpy,  imp, aby, imp, aby,  abx, abx, aby, aby,
    imm, inx, imm, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  abs, abs, abs, abs,
    rel, iyf, imp, iyf,  zpx, zpx, zpy, zpy,  imp, ayf, imp, ayf,  axf, axf, ayf, ayf,

    imm, inx, imm, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  abs, abs, abs, abs,
    rel, iyf, imp, iyf,  zpx, zpx, zpx, zpx,  imp, ayf, imp, ayf,  axf, axf, abx, abx,
    imm, inx, imm, inx,  zpg, zpg, zpg, zpg,  imp, imm, imp, imm,  abs, abs, abs, abs,
    rel, iyf, imp, iyf,  zpx, zpx, zpx, zpx,  imp, ayf, imp, ayf,  axf, axf, abx, abx,
];
export const exec_modes = modes.slice();
// JSR reads its operand weirdly so don't do it as part of the addressing mode
exec_modes[0x20] = imm;

const assemble_modes: Map<AddressingMode, AssembleAddressingMode> = new Map([
    ["implicit", "implicit"],
    ["immediate", "immediate"],
    ["zeropage", "zeropage"],
    ["zeropage,x", "zeropage,x"],
    ["zeropage,y", "zeropage,y"],
    ["relative", "relative"],
    ["absolute", "absolute"],
    ["absolute,x", "absolute,x"],
    ["absolute,x fast", "absolute,x"],
    ["absolute,y", "absolute,y"],
    ["absolute,y fast", "absolute,y"],
    ["indirect", "indirect"],
    ["indirect,x", "indirect,x"],
    ["indirect,y", "indirect,y"],
    ["indirect,y fast", "indirect,y"],
]);

type CommonInstruction = "brk" | "ora" | "jam" | "slo" | "nop" | "asl" | "php" | "anc" | "bpl" | "clc" | "jsr" | "and" | "rla" | "bit" | "rol" | "plp" | "bmi" | "sec" | "rti" | "eor" | "sre" | "lse" | "pha" | "alr" | "jmp" | "lsr" | "bvc" | "cli" | "rts" | "adc" | "rra" | "ror" | "pla" | "arr" | "bvs" | "sei" | "sta" | "sax" | "sty" | "stx" | "dey" | "txa" | "ane" | "bcc" | "sha" | "tya" | "txs" | "tas" | "shy" | "shx" | "ldy" | "lda" | "ldx" | "lax" | "tay" | "tax" | "lxa" | "bcs" | "clv" | "tsx" | "las" | "cpy" | "cmp" | "dcp" | "dec" | "iny" | "dex" | "sbx" | "bne" | "cld" | "cpx" | "sbc" | "isc" | "inc" | "inx" | "beq" | "sed";
// USBC is executed as SBC
export type AssembleInstruction = CommonInstruction | "usbc";
// Accumumator RMW instructions are executed differently from memory RMW instructions
export type Instruction = CommonInstruction | "asla" | "nopa" | "rola" | "lsra" | "rora";
export const instructions: Instruction[] = [
    "brk", "ora", "jam", "slo",  "nop", "ora", "asl", "slo",  "php", "ora", "asla","anc",  "nop", "ora", "asl", "slo",
    "bpl", "ora", "jam", "slo",  "nop", "ora", "asl", "slo",  "clc", "ora", "nopa","slo",  "nop", "ora", "asl", "slo",
    "jsr", "and", "jam", "rla",  "bit", "and", "rol", "rla",  "plp", "and", "rola","anc",  "bit", "and", "rol", "rla",
    "bmi", "and", "jam", "rla",  "nop", "and", "rol", "rla",  "sec", "and", "nopa","rla",  "nop", "and", "rol", "rla",

    "rti", "eor", "jam", "sre",  "nop", "eor", "lse", "sre",  "pha", "eor", "lsra","alr",  "jmp", "eor", "lsr", "sre",
    "bvc", "eor", "jam", "sre",  "nop", "eor", "lse", "sre",  "cli", "eor", "nopa","sre",  "nop", "eor", "lsr", "sre",
    "rts", "adc", "jam", "rra",  "nop", "adc", "ror", "rra",  "pla", "adc", "rora","arr",  "jmp", "adc", "ror", "rra",
    "bvs", "adc", "jam", "rra",  "nop", "adc", "ror", "rra",  "sei", "adc", "nopa","rra",  "nop", "adc", "ror", "rra",

    "nop", "sta", "nop", "sax",  "sty", "sta", "stx", "sax",  "dey", "nop", "txa", "ane",  "sty", "sta", "stx", "sax",
    "bcc", "sta", "jam", "sha",  "sty", "sta", "stx", "sax",  "tya", "sta", "txs", "tas",  "shy", "sta", "shx", "sha",
    "ldy", "lda", "ldx", "lax",  "ldy", "lda", "ldx", "lax",  "tay", "lda", "tax", "lxa",  "ldy", "lda", "ldx", "lax",
    "bcs", "lda", "jam", "lax",  "ldy", "lda", "ldx", "lax",  "clv", "lda", "tsx", "las",  "ldy", "lda", "ldx", "lax",

    "cpy", "cmp", "nop", "dcp",  "cpy", "cmp", "dec", "dcp",  "iny", "cmp", "dex", "sbx",  "cpy", "cmp", "dec", "dcp",
    "bne", "cmp", "jam", "dcp",  "nop", "cmp", "dec", "dcp",  "cld", "cmp", "nopa","dcp",  "nop", "cmp", "dec", "dcp",
    "cpx", "sbc", "nop", "isc",  "cpx", "sbc", "inc", "isc",  "inx", "sbc", "nopa","sbc",  "cpx", "sbc", "inc", "isc",
    "beq", "sbc", "jam", "inc",  "nop", "sbc", "inc", "isc",  "sed", "sbc", "nopa","isc",  "nop", "sbc", "inc", "isc",
];

export const encodings: Map<AssembleInstruction, Map<AssembleAddressingMode, number>> = new Map();
export const jams: boolean[] = [];
for(let i = 0; i < 256; i++) {
    let instruction = instructions[i];
    let assemble_instruction = instruction.slice(0,3) as AssembleInstruction;
    let mode = modes[i];
    let assemble_mode: AssembleAddressingMode = assemble_modes.get(mode)!;
    let slot = encodings.get(assemble_instruction);
    if(slot === undefined) {
        slot = new Map();
        encodings.set(assemble_instruction, slot);
    }
    slot.set(assemble_mode, i);
    jams.push(assemble_instruction == "jam");
}
// Don't encode SBC as USBC
encodings.get("sbc")!.set("immediate", 0xe9);
// Allow USBC
encodings.set("usbc", new Map([["immediate", 0xeb]]));
// Allow BRK #
encodings.get("brk")!.set("immediate", 0x00);