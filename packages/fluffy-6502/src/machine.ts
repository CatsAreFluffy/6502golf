import { exec_modes, instructions, jams } from "./instructions.js";

export type AccessType = "instruction" | "pointer" | "data" | "dummy";

export class Machine {
    memory: number[];

    pc: number;
    a: number = 0;
    x: number = 0;
    y: number = 0;
    s: number = 0xff;

    n: boolean = false;
    z: boolean = false;
    c: boolean = false;
    v: boolean = false;
    d: boolean = false;
    i: boolean = true;

    cycles: number = 0;
    instructions: number = 0;

    track_accesses: boolean = true;
    last_accesses: [number, AccessType][] = [];

    // sources: Map<number, [number, number]>;

    constructor(memory: number[]/*, sources: Map<number, [number, number]> = new Map()*/) {
        this.memory = memory;
        this.pc = (memory[0xfffd]! << 8) | memory[0xfffc]!;
        // this.sources = sources;
    }

    // serialize_memory(): Record<number, number[]> {
    //     const ret: Record<number, number[]> = {};
    //     for(let i = 0; i < 65536; i += 256) {
    //         let nonempty = false;
    //         for(let j = 0; j < 256; j++) {
    //             if(this.memory[i + j]) {
    //                 nonempty = true;
    //                 break;
    //             }
    //         }
    //         if(nonempty) {
    //             ret[i] = this.memory.slice(i, i + 256);
    //         }
    //     }
    //     return ret;
    // }

    // static deserialize(data: Record<number, number[]>): Machine {
    //     const memory = new Array(65536).fill(0);
    //     for(const i of Object.keys(data)) {
    //         for(let j = 0; j < 256; j++) {
    //             const index = ((+i) + j) | 0;
    //             if(index < 0 || index >= 65536) {
    //                 throw new Error("Memory address out of range");
    //             }
    //             const value = data[+i][j] | 0;
    //             if(value < 0 || value >= 256) {
    //                 throw new Error("Memory value out of range");
    //             }
    //             memory[index] = value;
    //         }
    //     }
    //     return new Machine(memory);
    // }

    clone(): Machine {
        const ret = new Machine(this.memory.slice());
        
        ret.pc = this.pc;
        ret.a = this.a;
        ret.x = this.x;
        ret.y = this.y;
        ret.s = this.s;
        
        ret.n = this.n;
        ret.z = this.z;
        ret.c = this.c;
        ret.v = this.v;
        ret.d = this.d;
        ret.i = this.i;

        ret.cycles = this.cycles;
        ret.instructions = this.instructions;

        ret.track_accesses = this.track_accesses;
        ret.last_accesses = this.last_accesses.slice();

        // ret.sources = this.sources;

        return ret;
    }

    read(address: number, access_type: AccessType): number {
        this.cycles++;
        if(this.track_accesses){
            this.last_accesses.push([address, access_type]);
        }
        return this.memory[address]!;
    }

    read_instruction(access_type: AccessType = "instruction"): number {
        const ret = this.read(this.pc, access_type);
        this.pc = (this.pc + 1) & 0xffff;
        return ret;
    }

    write(address: number, value: number, access_type: AccessType) {
        this.memory[address] = value;
        this.cycles++;
        if(this.track_accesses){
            this.last_accesses.push([address, access_type]);
        }
    }

    nz_bytes(): number {
        let bytes = 0;
        for(const i of this.memory) {
            bytes += +(i != 0);
        }
        return bytes;
    }

    last_access_map(): Map<number, AccessType> {
        return new Map(this.last_accesses);
    }
    
    set_nz(value: number) {
        this.z = value == 0;
        this.n = value >= 128;
    }

    set_p(p: number) {
        this.c = (p & 0x01) > 0;
        this.z = (p & 0x02) > 0;
        this.i = (p & 0x04) > 0;
        this.d = (p & 0x08) > 0;
        this.v = (p & 0x40) > 0;
        this.n = (p & 0x80) > 0;
    }

    get_p(b: boolean): number {
        let p = 0x20;
        p |= +this.c;
        p |= +this.z << 1;
        p |= +this.i << 2;
        p |= +this.d << 3;
        p |= +b << 4;
        p |= +this.v << 6;
        p |= +this.n << 7;
        return p;
    }

    adc(value: number) {
        const dec_result = this.a + value + +this.c;
        if(this.d) {
            this.z = (dec_result & 0xff) == 0;
            let result_low = (this.a & 0x0f) + (value & 0x0f) + +this.c;
            if(result_low >= 10) {
                result_low = ((result_low & 0x0f) + 6) | 0x10;
            }
            let result = (this.a & 0xf0) + (value & 0xf0) + result_low;
            this.n = (result & 0x80) != 0;
            this.v = ((this.a & 0x80) == (value & 0x80)) && ((this.a & 0x80) != (result & 0x80));
            if(result >= (10 << 4)) {
                result += 6 << 4;
            }
            this.a = result & 0xff;
            this.c = result >= 256;
        } else {
            this.v = ((this.a & 0x80) == (value & 0x80)) && ((this.a & 0x80) != (dec_result & 0x80));
            this.a = dec_result & 0xff;
            this.set_nz(this.a);
            this.c = dec_result >= 256;
        }
    }

    sbc(value: number) {
        const value2 = value ^ 0xff;
        const dec_result = this.a + value2 + +this.c;
        if(this.d) {
            this.v = ((this.a & 0x80) == (value2 & 0x80)) && ((this.a & 0x80) != (dec_result & 0x80));
            this.set_nz(dec_result & 0xff);
            let result_low = (this.a & 0x0f) - (value & 0x0f) + +this.c - 1;
            if(result_low < 0) {
                result_low = (result_low - 0x06) | ~0x0f;
            }
            let result = (this.a & 0xf0) - (value & 0xf0) + result_low;
            if(result < 0) {
                result -= 6 << 4;
            }
            this.a = result & 0xff;
            this.c = dec_result >= 256;
        } else {
            this.v = ((this.a & 0x80) == (value2 & 0x80)) && ((this.a & 0x80) != (dec_result & 0x80));
            this.a = dec_result & 0xff;
            this.set_nz(this.a);
            this.c = dec_result >= 256;
        }
    }

    step() {
        this.last_accesses = [];
        this.instructions++;
        const instruction_start = this.pc;
        const opcode = this.read_instruction();
        const instruction = instructions[opcode];
        const mode = exec_modes[opcode];
        let effective_address = 0;
        switch(mode) {
            case "absolute": {
                const low = this.read_instruction();
                const high = this.read_instruction();
                effective_address = (high << 8) | low;
                break;
            }
            case "absolute,x":
            case "absolute,x fast": {
                const low = this.read_instruction();
                const high = this.read_instruction();
                const base_address = (high << 8) | low;
                effective_address = (base_address + this.x) & 0xffff;
                if(
                    mode == "absolute,x" ||
                    (base_address >> 8) != (effective_address >> 8)
                ) {
                    this.read((base_address & 0xff00) + (effective_address & 0x00ff), "dummy");
                }
                break;
            }
            case "absolute,y":
            case "absolute,y fast": {
                const low = this.read_instruction();
                const high = this.read_instruction();
                const base_address = (high << 8) | low;
                effective_address = (base_address + this.y) & 0xffff;
                if(
                    mode == "absolute,y" ||
                    (base_address >> 8) != (effective_address >> 8)
                ) {
                    this.read((base_address & 0xff00) + (effective_address & 0x00ff), "dummy");
                }
                break;
            }
            case "immediate": 
                effective_address = this.pc;
                this.pc = (this.pc + 1) & 0xffff;
                break;
            case "implicit":
                this.read(this.pc, "dummy");
                break;
            case "indirect": {
                const base_low = this.read_instruction();
                const base_high = this.read_instruction();
                const pointer_address = (base_high << 8) | base_low;
                const low = this.read(pointer_address, "pointer");
                const high = this.read((pointer_address + 1) & 0xffff, "pointer");
                effective_address = (high << 8) | low;
                break;
            }
            case "indirect,x": {
                const base = this.read_instruction();
                this.read(base, "dummy");
                const pointer_address = (base + this.x) & 0xff;
                const low = this.read(pointer_address, "pointer");
                const high = this.read((pointer_address + 1) & 0xff, "pointer");
                effective_address = (high << 8) | low;
                break;
            }
            case "indirect,y":
            case "indirect,y fast": {
                const pointer_address = this.read_instruction();
                const low = this.read(pointer_address, "pointer");
                const high = this.read((pointer_address + 1) & 0xff, "pointer");
                const base_address = (high << 8) | low;
                effective_address = (base_address + this.y) & 0xffff;
                if(
                    mode == "indirect,y" ||
                    (base_address >> 8) != (effective_address >> 8)
                ) {
                    this.read((base_address & 0xff00) + (effective_address & 0x00ff), "dummy");
                }
                break;
            }
            case "relative": {
                let offset = this.read_instruction();
                if(offset >= 128) {
                    offset -= 256;
                }
                effective_address = (this.pc + offset) & 0xffff;
                break;
            }
            case "zeropage":
                effective_address = this.read_instruction();
                break;
            case "zeropage,x": {
                const base_address = this.read_instruction();
                this.read(base_address, "dummy");
                effective_address = (base_address + this.x) & 0xff;
                break;
            }
            case "zeropage,y": {
                const base_address = this.read_instruction();
                this.read(base_address, "dummy");
                effective_address = (base_address + this.y) & 0xff;
                break;
            }
            default:
                throw new Error(`Unknown addressing mode ${mode}`);
        }
        switch(instruction) {
            case "and":
                this.a &= this.read(effective_address, "data");
                this.set_nz(this.a);
                break;
            case "adc":
                this.adc(this.read(effective_address, "data"));
                break;
            case "sbc":
                this.sbc(this.read(effective_address, "data"));
                break;
            case "asla":
            case "rola": {
                const cin = this.c && instruction == "rola";
                const shifted = this.a << 1 | +cin;
                this.a = shifted & 0xff;
                this.set_nz(this.a);
                this.c = (shifted >> 8) > 0;
                break;
            }
            case "asl":
            case "rol": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const cin = this.c && instruction == "rol";
                const shifted = value << 1 | +cin;
                const result = shifted & 0xff;
                this.write(effective_address, result, "data");
                this.set_nz(result);
                this.c = (shifted >> 8) > 0;
                break;
            }
            case "alr": {
                const value = this.a & this.read(effective_address, "data");
                this.c = (value & 1) > 0;
                this.a = value >> 1;
                this.set_nz(this.a);
                break;
            }
            case "anc": {
                this.a &= this.read(effective_address, "data");
                this.set_nz(this.a);
                this.c = this.n;
                break;
            }
            case "ane": {
                // Assuming magic constant 0xff
                this.a = this.x & this.read(effective_address, "data");
                this.set_nz(this.a);
                break;
            }
            case "arr": {
                const value = this.read(effective_address, "data");
                const merge = this.a & value;
                const result = (+this.c << 8 | merge) >> 1;
                this.set_nz(result);
                this.v = ((result & 0x40) ^ ((result & 0x20) << 1)) > 0;
                if(this.d) {
                    this.a = result;
                    if((merge & 0x0f) > 0x04) {
                        this.a = (this.a & 0xf0) + ((this.a + 0x06) & 0x0f);
                    }
                    if((merge & 0xf0) > 0x40) {
                        this.a = ((this.a + 0x60) & 0xf0) + (this.a & 0x0f);
                    }
                    this.c = (merge & 0xf0) > 0x40;
                } else {
                    this.a = result;
                    this.c = (result & 0x40) > 0;
                }
                break;
            }
            case "bcc":
            case "bcs":
            case "beq":
            case "bmi":
            case "bne":
            case "bpl":
            case "bvc":
            case "bvs": {
                const conditions = {
                    bcc: !this.c,
                    bcs: this.c,
                    beq: this.z,
                    bmi: this.n,
                    bne: !this.z,
                    bpl: !this.n,
                    bvs: this.v,
                    bvc: !this.v,
                };
                if(conditions[instruction]) {
                    this.read_instruction("dummy");
                    if((effective_address >> 8) != (this.pc >> 8)) {
                        this.read((this.pc & 0xff00) | (effective_address & 0xff), "dummy");
                    }
                    this.pc = effective_address;
                }
                break;
            }
            case "bit": {
                const value = this.read(effective_address, "data");
                this.n = value >= 128;
                this.v = ((value >> 6) & 1) == 1;
                this.z = (this.a & value) == 0;
                break;
            }
            case "brk": {
                this.read(effective_address, "dummy");
                this.write(0x100 + this.s, this.pc >> 8, "data");
                this.s = (this.s - 1) & 0xff;
                this.write(0x100 + this.s, this.pc & 0xff, "data");
                this.s = (this.s - 1) & 0xff;
                this.write(0x100 + this.s, this.get_p(true), "data");
                this.s = (this.s - 1) & 0xff;
                const pc_low = this.read(0xfffe, "data");
                const pc_high = this.read(0xffff, "data");
                this.pc = (pc_high << 8) | pc_low;
                this.i = true;
                break;
            }
            case "clc":
            case "sec":
                this.c = instruction == "sec";
                break;
            case "cld":
            case "sed":
                this.d = instruction == "sed";
                break;
            case "cli":
            case "sei":
                this.i = instruction == "sei";
                break;
            case "clv":
                this.v = false;
                break;
            case "cmp":
            case "cpx":
            case "cpy": {
                let base;
                switch(instruction) {
                    case "cmp":
                        base = this.a;
                        break;
                    case "cpx":
                        base = this.x;
                        break;
                    case "cpy":
                        base = this.y;
                        break;
                }
                const result = base - this.read(effective_address, "data");
                this.set_nz(result & 0xff);
                this.c = (result & 0x100) == 0;
                break;
            }
            case "dcp": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const result = (value - 1) & 0xff;
                this.write(effective_address, result, "data");
                const cmp_result = this.a - result;
                this.set_nz(cmp_result & 0xff);
                this.c = cmp_result >= 256;
                break;
            }
            case "dec": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const result = (value - 1) & 0xff;
                this.write(effective_address, result, "data");
                this.set_nz(result);
                break;
            }
            case "dex":
                this.x = (this.x - 1) & 0xff;
                this.set_nz(this.x);
                break;
            case "dey":
                this.y = (this.y - 1) & 0xff;
                this.set_nz(this.y);
                break;
            case "eor":
                this.a ^= this.read(effective_address, "data");
                this.set_nz(this.a);
                break;
            case "inc": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const result = (value + 1) & 0xff;
                this.write(effective_address, result, "data");
                this.set_nz(result);
                break;
            }
            case "inx":
                this.x = (this.x + 1) & 0xff;
                this.set_nz(this.x);
                break;
            case "iny":
                this.y = (this.y + 1) & 0xff;
                this.set_nz(this.y);
                break;
            case "isc": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const result = (value + 1) & 0xff;
                this.write(effective_address, result, "data");
                this.sbc(result);
                break;
            }
            case "jmp":
                this.pc = effective_address;
                break;
            case "jsr": {
                const new_pcl = this.read(effective_address, "instruction");
                this.read(0x100 + this.s, "dummy");
                this.write(0x100 + this.s, (this.pc >> 8) & 0xff, "data");
                this.s = (this.s - 1) & 0xff;
                this.write(0x100 + this.s, this.pc & 0xff, "data");
                this.s = (this.s - 1) & 0xff;
                const new_pch = this.read_instruction();
                this.pc = (new_pch << 8) | new_pcl;
                break;
            }
            case "las":
                this.a = this.x = this.s = this.read(effective_address, "data") & this.s;
                this.set_nz(this.a);
                break;
            case "lax":
            case "lxa":
                // Assuming magic constant 0xff for lxa
                this.a = this.x = this.read(effective_address, "data");
                this.set_nz(this.a);
                break;
            case "lda":
                this.a = this.read(effective_address, "data");
                this.set_nz(this.a);
                break;
            case "ldx":
                this.x = this.read(effective_address, "data");
                this.set_nz(this.x);
                break;
            case "ldy":
                this.y = this.read(effective_address, "data");
                this.set_nz(this.y);
                break;
            case "lsr":
            case "ror": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const cin = this.c && instruction == "ror";
                const result = (+cin << 8 | value) >> 1;
                this.write(effective_address, result, "data");
                this.set_nz(result);
                this.c = (value & 1) > 0;
                break;
            }
            case "lsra":
            case "rora": {
                const cin = this.c && instruction == "rora";
                this.c = (this.a & 1) > 0;
                this.a = (+cin << 8 | this.a) >> 1;
                this.set_nz(this.a);
                break;
            }
            case "nop":
                this.read(effective_address, "dummy");
                break;
            case "nopa":
                break;
            case "ora":
                this.a |= this.read(effective_address, "data");
                this.set_nz(this.a);
                break;
            case "pha":
                this.write(0x100 + this.s, this.a, "data");
                this.s = (this.s - 1) & 0xff;
                break;
            case "php": {
                this.write(0x100 + this.s, this.get_p(true), "data");
                this.s = (this.s - 1) & 0xff;
                break;
            }
            case "pla":
                this.read(0x100 + this.s, "dummy");
                this.s = (this.s + 1) & 0xff;
                this.a = this.read(0x100 + this.s, "data");
                break;
            case "plp": {
                this.read(0x100 + this.s, "dummy");
                this.s = (this.s + 1) & 0xff;
                this.set_p(this.read(0x100 + this.s, "data"));
                break;
            }
            case "rla": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const shifted = value << 1 | +this.c;
                const result = shifted & 0xff;
                this.write(effective_address, result, "data");
                this.c = (shifted >> 8) > 0;
                this.a &= result;
                this.set_nz(this.a);
                break;
            }
            case "rra": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const result = (+this.c << 8 | value) >> 1;
                this.write(effective_address, result, "data");
                this.c = (value & 1) > 0;
                this.adc(result);
                break;
            }
            case "rti": {
                this.read(0x100 + this.s, "dummy");
                this.s = (this.s + 1) & 0xff;
                this.set_p(this.read(0x100 + this.s, "data"));
                this.s = (this.s + 1) & 0xff;
                const pc_low = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                const pc_high = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                this.pc = (pc_high << 8) | pc_low;
                break;
            }
            case "rts": {
                this.read(0x100 + this.s, "dummy");
                this.s = (this.s + 1) & 0xff;
                const pc_low = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                const pc_high = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                this.pc = (pc_high << 8) | pc_low;
                this.read_instruction("dummy");
                break;
            }
            case "sax":
                this.write(effective_address, this.a & this.x, "data");
                break;
            case "sbx": {
                const ax = this.a & this.x;
                const value = this.read(effective_address, "data");
                const result = ax + (value ^ 0xff) + 1;
                this.x = result & 0xff;
                this.set_nz(this.x);
                this.c = result >= 256;
                break;
            }
            case "sha": {
                const value = this.a & this.x & (((effective_address - this.y) >> 8) + 1);
                if((effective_address & 0xff) <= this.y) {
                    this.write(effective_address, value, "data");
                } else {
                    this.write(effective_address, value, "data");
                }
                break;
            }
            case "shx": {
                const value = this.x & (((effective_address - this.y) >> 8) + 1);
                if((effective_address & 0xff) <= this.y) {
                    this.write(effective_address, value, "data");
                } else {
                    this.write(effective_address, value, "data");
                }
                break;
            }
            case "shy": {
                const value = this.y & (((effective_address - this.x) >> 8) + 1);
                if((effective_address & 0xff) <= this.x) {
                    this.write(effective_address, value, "data");
                } else {
                    this.write(effective_address, value, "data");
                }
                break;
            }
            case "slo": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const shifted = value << 1;
                const result = shifted & 0xff;
                this.write(effective_address, result, "data");
                this.c = (shifted >> 8) > 0;
                this.a |= result;
                this.set_nz(this.a);
                break;
            }
            case "sre": {
                const value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                const result = value >> 1;
                this.write(effective_address, result, "data");
                this.c = (value & 1) > 0;
                this.a ^= result;
                this.set_nz(this.a);
                break;
            }
            case "sta":
                this.write(effective_address, this.a, "data");
                break;
            case "stx":
                this.write(effective_address, this.x, "data");
                break;
            case "sty":
                this.write(effective_address, this.y, "data");
                break;
            case "tas": {
                this.s = this.a & this.x;
                const value = this.a & this.x & (((effective_address - this.y) >> 8) + 1);
                if((effective_address & 0xff) <= this.y) {
                    this.write(effective_address, value, "data");
                } else {
                    this.write(effective_address, value, "data");
                }
                break;
            }
            case "tax":
                this.x = this.a;
                this.set_nz(this.x);
                break;
            case "tay":
                this.y = this.a;
                this.set_nz(this.y);
                break;
            case "tsx":
                this.x = this.s;
                this.set_nz(this.x);
                break;
            case "txa":
                this.a = this.x;
                this.set_nz(this.a);
                break;
            case "txs":
                this.s = this.x;
                break;
            case "tya":
                this.a = this.y;
                this.set_nz(this.a);
                break;
            case "jam":
                throw new Error(`JAM at address ${instruction_start.toString(16).padStart(4, "0")}`);
        }
    }

    run_until_jam(max_cycles?: number) {
        let cycle_cap = 1e300;
        if(max_cycles !== undefined) {
            cycle_cap = this.cycles + max_cycles;
        }
        while(!jams[this.memory[this.pc]!]) {
            this.step();
            if(this.cycles >= cycle_cap) {
                return;
            }
        }
    }
}