import { createContext } from "react";
import { MemoryRange } from "./machine";

export const RangeContext = createContext([new MemoryRange(0, 0), new MemoryRange(0, 0)]);