import { exec_modes, instructions } from "./instructions";

export type AccessType = "instruction" | "pointer" | "data" | "dummy";

export default class Machine {
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

    constructor(memory: number[]) {
        this.memory = memory;

        this.pc = (memory[0xfffd] << 8) | memory[0xfffc];
    }

    serialize_memory(): string {
        let ret: any = {};
        for(let i = 0; i < 65536; i += 256) {
            let nonempty = false;
            for(let j = 0; j < 256; j++) {
                if(this.memory[i + j]) {
                    nonempty = true;
                    break;
                }
            }
            if(nonempty) {
                ret[i] = this.memory.slice(i, i + 256);
            }
        }
        return JSON.stringify(ret);
    }

    static deserialize(data: string): Machine {
        let memory = JSON.parse(data);
        let mem_array = new Array(65536).fill(0);
        for(let i of Object.keys(memory)) {
            for(let j = 0; j < 256; j++) {
                mem_array[(+i) + j] = memory[i][j];
            }
        }
        return new Machine(mem_array);
    }

    clone(): Machine {
        let ret = new Machine(this.memory.slice());
        
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

        return ret;
    }

    read(address: number, access_type: AccessType): number {
        this.cycles++;
        if(this.track_accesses){
            this.last_accesses.push([address, access_type]);
        }
        return this.memory[address];
    }

    read_instruction(access_type: AccessType = "instruction"): number {
        let ret = this.read(this.pc, access_type);
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
        for(let i of this.memory) {
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

    step() {
        this.last_accesses = [];
        this.instructions++;
        let instruction_start = this.pc;
        let opcode = this.read_instruction();
        let instruction = instructions[opcode];
        let mode = exec_modes[opcode];
        let effective_address = 0;
        switch(mode) {
            case "absolute": {
                let low = this.read_instruction();
                let high = this.read_instruction();
                effective_address = (high << 8) | low;
                break;
            }
            case "absolute,x":
            case "absolute,x fast": {
                let low = this.read_instruction();
                let high = this.read_instruction();
                let base_address = (high << 8) | low;
                effective_address = (base_address + this.x) & 0xffff;
                if(
                    mode == "absolute,x" ||
                    (base_address >> 8) != (effective_address >> 8)
                ) {
                    this.read((effective_address - 256) & 0xffff, "dummy");
                }
                break;
            }
            case "absolute,y":
            case "absolute,y fast": {
                let low = this.read_instruction();
                let high = this.read_instruction();
                let base_address = (high << 8) | low;
                effective_address = (base_address + this.y) & 0xffff;
                if(
                    mode == "absolute,y" ||
                    (base_address >> 8) != (effective_address >> 8)
                ) {
                    this.read((effective_address - 256) & 0xffff, "dummy");
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
                let base_low = this.read_instruction();
                let base_high = this.read_instruction();
                let pointer_address = (base_high << 8) | base_low;
                let low = this.read(pointer_address, "pointer");
                let high = this.read((pointer_address + 1) & 0xffff, "pointer");
                effective_address = (high << 8) | low;
                break;
            }
            case "indirect,x": {
                let base = this.read_instruction();
                this.read(base, "dummy");
                let pointer_address = (base + this.x) & 0xff;
                let low = this.read(pointer_address, "pointer");
                let high = this.read((pointer_address + 1) & 0xff, "pointer");
                effective_address = (high << 8) | low;
                break;
            }
            case "indirect,y":
            case "indirect,y fast": {
                let pointer_address = this.read_instruction();
                let low = this.read(pointer_address, "pointer");
                let high = this.read((pointer_address + 1) & 0xff, "pointer");
                let base_address = (high << 8) | low;
                effective_address = (base_address + this.y) & 0xffff;
                if(
                    mode == "indirect,y" ||
                    (base_address >> 8) != (effective_address >> 8)
                ) {
                    this.read((effective_address - 256) & 0xffff, "dummy");
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
                let base_address = this.read_instruction();
                this.read(base_address, "dummy");
                effective_address = (base_address + this.x) & 0xff;
                break;
            }
            case "zeropage,y": {
                let base_address = this.read_instruction();
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
            case "sbc": {
                let value = this.read(effective_address, "data");
                let value2 = instruction == "sbc" ? value ^ 0xff : value;
                let dec_result = this.a + value2 + +this.c;
                if(this.d) {
                    if(instruction == "adc") {
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
                    }
                } else {
                    this.v = ((this.a & 0x80) == (value2 & 0x80)) && ((this.a & 0x80) != (dec_result & 0x80));
                    this.a = dec_result & 0xff;
                    this.set_nz(this.a);
                    this.c = dec_result >= 256;
                }
                break;
            }
            case "asla":
            case "rola": {
                let cin = this.c && instruction == "rola";
                let shifted = this.a << 1 | +cin;
                this.a = shifted & 0xff;
                this.set_nz(this.a);
                this.c = (shifted >> 8) > 0;
                break;
            }
            case "asl":
            case "rol": {
                let value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                let cin = this.c && instruction == "rol";
                let shifted = value << 1 | +cin;
                let result = shifted & 0xff;
                this.write(effective_address, result, "data");
                this.set_nz(result);
                this.c = (shifted >> 8) > 0;
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
                let conditions = {
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
                let value = this.read(effective_address, "data");
                this.n = value >= 128;
                this.v = ((value >> 6) & 1) == 1;
                this.z = (this.a & value) == 0;
                break;
            }
            case "brk": {
                this.write(0x100 + this.s, this.pc >> 8, "data");
                this.s = (this.s - 1) & 0xff;
                this.write(0x100 + this.s, this.pc & 0xff, "data");
                this.s = (this.s - 1) & 0xff;
                let flags = 0x30;
                flags |= +this.c;
                flags |= +this.z << 1;
                flags |= +this.i << 2;
                flags |= +this.d << 3;
                flags |= +this.v << 6;
                flags |= +this.n << 7;
                this.write(0x100 + this.s, flags, "data");
                this.s = (this.s - 1) & 0xff;
                let pc_low = this.read(0xfffe, "data");
                let pc_high = this.read(0xffff, "data");
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
                let result = base - this.read(effective_address, "data");
                this.set_nz(result & 0xff);
                this.c = (result & 0x100) == 0;
                break;
            }
            case "dec": {
                let value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                let result = (value - 1) & 0xff;
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
                let value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                let result = (value + 1) & 0xff;
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
            case "jmp":
                this.pc = effective_address;
                break;
            case "jsr": {
                let new_pcl = this.read(effective_address, "instruction");
                this.read(0x100 + this.s, "dummy");
                this.write(0x100 + this.s, (this.pc >> 8) & 0xff, "data");
                this.s = (this.s - 1) & 0xff;
                this.write(0x100 + this.s, this.pc & 0xff, "data");
                this.s = (this.s - 1) & 0xff;
                let new_pch = this.read_instruction();
                this.pc = (new_pch << 8) | new_pcl;
                break;
            }
            case "lax":
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
                let value = this.read(effective_address, "data");
                this.write(effective_address, value, "dummy");
                let cin = this.c && instruction == "ror";
                let result = (+cin << 8 | value) >> 1;
                this.write(effective_address, result, "data");
                this.set_nz(result);
                this.c = (value & 1) > 0;
                break;
            }
            case "lsra":
            case "rora": {
                let cin = this.c && instruction == "rora";
                this.c = (this.a & 1) > 0;
                this.a = (+cin << 8 | this.a) >> 1;
                this.set_nz(this.a);
                break;
            }
            case "nop":
                this.read(effective_address, mode == "immediate" ? "instruction" : "dummy");
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
                let flags = 0x30;
                flags |= +this.c;
                flags |= +this.z << 1;
                flags |= +this.i << 2;
                flags |= +this.d << 3;
                flags |= +this.v << 6;
                flags |= +this.n << 7;
                this.write(0x100 + this.s, flags, "data");
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
                let flags = this.read(0x100 + this.s, "data");
                this.c = (flags & 0x01) > 0;
                this.z = (flags & 0x02) > 0;
                this.i = (flags & 0x04) > 0;
                this.d = (flags & 0x08) > 0;
                this.v = (flags & 0x40) > 0;
                this.n = (flags & 0x80) > 0;
                break;
            }
            case "rti": {
                this.read(0x100 + this.s, "dummy");
                this.s = (this.s + 1) & 0xff;
                let flags = this.read(0x100 + this.s, "data");
                this.c = (flags & 0x01) > 0;
                this.z = (flags & 0x02) > 0;
                this.i = (flags & 0x04) > 0;
                this.d = (flags & 0x08) > 0;
                this.v = (flags & 0x40) > 0;
                this.n = (flags & 0x80) > 0;
                this.s = (this.s + 1) & 0xff;
                let pc_low = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                let pc_high = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                this.pc = (pc_high << 8) | pc_low;
                break;
            }
            case "rts": {
                this.read(0x100 + this.s, "dummy");
                this.s = (this.s + 1) & 0xff;
                let pc_low = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                let pc_high = this.read(0x100 + this.s, "data");
                this.s = (this.s + 1) & 0xff;
                this.pc = (pc_high << 8) | pc_low;
                this.read_instruction();
                break;
            }
            case "sbx": {
                let ax = this.a & this.x;
                let value = this.read(effective_address, "data");
                let result = ax + (value ^ 0xff) + 1;
                this.x = result & 0xff;
                this.set_nz(this.x);
                this.c = result >= 256;
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
            default:
                throw new Error(`Unknown instruction ${instruction} (address ${instruction_start.toString(16).padStart(4, "0")})`);
        }
    }
}