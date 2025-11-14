export class MemoryRange {
    start: number;
    end: number;

    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }

    includes(value: number): boolean {
        return +(value >= this.start) + +(value < this.end) + +(this.start > this.end) >= 2;
    }

    overlaps(other: MemoryRange): boolean {
        if(this.start == this.end || other.start == other.end) {
            return false;
        }
        return this.includes(other.start) || other.includes(this.start);
    }
}

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
    i: boolean = false;

    cycles: number = 0;

    last_instruction: MemoryRange = new MemoryRange(0, 0);
    last_data: MemoryRange = new MemoryRange(0, 0);

    constructor(memory: number[]) {
        this.memory = memory;

        this.pc = (memory[0xfffd] << 8) | memory[0xfffc];
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

        return ret;
    }

    read(address: number): number {
        this.cycles++;
        return this.memory[address];
    }

    read_instruction(): number {
        let ret = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        return ret;
    }

    write(address: number, value: number) {
        this.memory[address] = value;
        this.cycles++;
    }
    
    set_nz(value: number) {
        this.z = value == 0;
        this.n = value >= 128;
    }

    step() {
        let instruction_start = this.pc;
        const opcodes = new Map([
            [0x0a, ["asl.a", "implicit"]],
            [0x0e, ["asl", "absolute"]],
            [0x10, ["bpl", "relative"]],
            [0x18, ["clc", "implicit"]],
            [0x26, ["rol", "zeropage"]],
            [0x2a, ["rol.a", "implicit"]],
            [0x2e, ["rol", "absolute"]],
            [0x38, ["sec", "implicit"]],
            [0x65, ["adc", "zeropage"]],
            [0x69, ["adc", "immediate"]],
            [0x6d, ["adc", "absolute"]],
            [0x7d, ["adc", "absolute,x fast"]],
            [0x84, ["sty", "zeropage"]],
            [0x85, ["sta", "zeropage"]],
            [0x86, ["stx", "zeropage"]],
            [0x88, ["dey", "implicit"]],
            [0x8a, ["txa", "implicit"]],
            [0x8c, ["sty", "absolute"]],
            [0x8d, ["sta", "absolute"]],
            [0x8e, ["stx", "absolute"]],
            [0x90, ["bcc", "relative"]],
            [0x98, ["tya", "implicit"]],
            [0x99, ["sta", "absolute,y"]],
            [0x9d, ["sta", "absolute,x"]],
            [0xa0, ["ldy", "immediate"]],
            [0xa2, ["ldx", "immediate"]],
            [0xa4, ["ldy", "zeropage"]],
            [0xa5, ["lda", "zeropage"]],
            [0xa6, ["ldx", "zeropage"]],
            [0xa8, ["tay", "implicit"]],
            [0xa9, ["lda", "immediate"]],
            [0xaa, ["tax", "implicit"]],
            [0xac, ["ldy", "absolute"]],
            [0xad, ["lda", "absolute"]],
            [0xae, ["ldx", "absolute"]],
            [0xb0, ["bcs", "relative"]],
            [0xbd, ["lda", "absolute,x fast"]],
            [0xbe, ["ldx", "absolute,y fast"]],
            [0xc8, ["iny", "implicit"]],
            [0xca, ["dex", "implicit"]],
            [0xd0, ["bne", "relative"]],
            [0xe5, ["sbc", "zeropage"]],
            [0xe8, ["inx", "implicit"]],
            [0xed, ["sbc", "absolute"]],
        ]);
        let opcode = this.read_instruction();
        let decode = opcodes.get(opcode);
        if(!decode) {
            throw new Error(`Unknown opcode ${opcode.toString(16).padStart(2, "0")}`);
        }
        let [instruction, mode] = decode;
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
                    this.read((effective_address - 256) & 0xffff);
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
                    this.read((effective_address - 256) & 0xffff);
                }
                break;
            }
            case "immediate": 
                effective_address = this.pc;
                this.pc++;
                break;
            case "implicit":
                this.read(this.pc);
                break;
            case "relative":
                let offset = this.read_instruction();
                if(offset >= 128) {
                    offset -= 256;
                }
                effective_address = (this.pc + offset) & 0xffff;
                break;
            case "zeropage":
                effective_address = this.read_instruction();
                break;
            default:
                throw new Error(`Unknown addressing mode ${mode}`);
        }
        if(mode == "immediate" || mode == "implicit" || mode == "relative") {
            this.last_data = new MemoryRange(0, 0);
        } else {
            this.last_data = new MemoryRange(effective_address, (effective_address + 1) & 0xffff);
        }
        let is_jump = false;
        switch(instruction) {
            case "adc":
            case "sbc": {
                let value = this.read(effective_address);
                let value2 = instruction == "sbc" ? value ^ 0xff : value;
                let result = this.a + value2 + +this.c;
                this.v = ((this.a & 0x80) == (value & 0x80)) && ((this.a & 0x80) != (result & 0x80));
                this.a = result & 0xff;
                this.set_nz(this.a);
                this.c = result >= 256;
                break;
            }
            case "asl.a":
            case "rol.a": {
                let cin = this.c && instruction == "rol.a";
                let shifted = this.a << 1 | +cin;
                this.a = shifted & 0xff;
                this.set_nz(this.a);
                this.c = (shifted >> 8) > 0;
                break;
            }
            case "asl":
            case "rol": {
                let value = this.read(effective_address);
                this.write(effective_address, value);
                let cin = this.c && instruction == "rol";
                let shifted = value << 1 | +cin;
                let result = shifted & 0xff;
                this.write(effective_address, result);
                this.set_nz(result);
                this.c = (shifted >> 8) > 0;
                break;
            }
            case "bcc":
            case "bcs":
            case "bne":
            case "bpl": {
                is_jump = true;
                this.last_instruction = new MemoryRange(instruction_start, this.pc);
                let conditions = {
                    bcc: !this.c,
                    bcs: this.c,
                    bne: !this.z,
                    bpl: !this.n,
                };
                if(conditions[instruction]) {
                    this.read_instruction();
                    if((effective_address >> 8) != (this.pc >> 8)) {
                        this.read((this.pc & 0xff00) | (effective_address & 0xff));
                    }
                    this.pc = effective_address;
                }
                break;
            }
            case "clc":
            case "sec": {
                this.c = instruction == "sec";
                break;
            }
            case "dex": {
                this.x = (this.x - 1) & 0xff;
                this.set_nz(this.x);
                break;
            }
            case "dey": {
                this.y = (this.y - 1) & 0xff;
                this.set_nz(this.y);
                break;
            }
            case "inx": {
                this.x = (this.x + 1) & 0xff;
                this.set_nz(this.x);
                break;
            }
            case "iny": {
                this.y = (this.y + 1) & 0xff;
                this.set_nz(this.y);
                break;
            }
            case "lda":
                this.a = this.read(effective_address);
                this.set_nz(this.a);
                break;
            case "ldx":
                this.x = this.read(effective_address);
                this.set_nz(this.x);
                break;
            case "ldy":
                this.y = this.read(effective_address);
                this.set_nz(this.y);
                break;
            case "sta":
                this.write(effective_address, this.a);
                break;
            case "stx":
                this.write(effective_address, this.x);
                break;
            case "sty":
                this.write(effective_address, this.y);
                break;
            case "tax":
                this.x = this.a;
                this.set_nz(this.x);
                break;
            case "tay":
                this.y = this.a;
                this.set_nz(this.y);
                break;
            case "txa":
                this.a = this.x;
                this.set_nz(this.a);
                break;
            case "tya":
                this.a = this.y;
                this.set_nz(this.a);
                break;
            default:
                throw new Error(`Unknown instruction ${instruction}`);
        }
        if(!is_jump) {
            let instruction_end = this.pc;
            this.last_instruction = new MemoryRange(instruction_start, instruction_end);
        }
    }
}