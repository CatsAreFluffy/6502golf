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
            [0x2a, ["rol.a", "implicit"]],
            [0x38, ["sec", "implicit"]],
            [0x8d, ["sta", "absolute"]],
            [0x9d, ["sta", "absolute,x"]],
            [0xa2, ["ldx", "immediate"]],
            [0xa9, ["lda", "immediate"]],
            [0xad, ["lda", "absolute"]],
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
            case "absolute,x": {
                let low = this.read_instruction();
                let high = this.read_instruction();
                let base_address = (high << 8) | low;
                effective_address = (base_address + this.x) & 0xffff;
                if((base_address >> 8) != (effective_address >> 8)) {
                    this.read((effective_address - 256) & 0xffff);
                }
                break;
            }
            case "immediate": 
                effective_address = this.pc;
                this.pc++;
                break;
            case "implicit":
                break;
            default:
                throw new Error(`Unknown addressing mode ${mode}`);
        }
        if(mode == "immediate" || mode == "implicit") {
            this.last_data = new MemoryRange(0, 0);
        } else {
            this.last_data = new MemoryRange(effective_address, (effective_address + 1) & 0xffff);
        }
        switch(instruction) {
            case "asl.a": {
                let shifted = this.a << 1;
                this.a = shifted & 0xff;
                this.set_nz(this.a);
                this.c = (shifted >> 8) > 0;
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
            case "rol.a": {
                let shifted = this.a << 1 | +this.c;
                this.a = shifted & 0xff;
                this.set_nz(this.a);
                this.c = (shifted >> 8) > 0;
                break;
            }
            case "sec":
                this.c = true;
                break;
            case "sta":
                this.write(effective_address, this.a);
                break;
            default:
                throw new Error(`Unknown instruction ${instruction}`);
        }
        let instruction_end = this.pc;
        this.last_instruction = new MemoryRange(instruction_start, instruction_end);
    }
}