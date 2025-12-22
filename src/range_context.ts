import { Context, createContext } from "react";
import { AccessType } from "./machine.ts";

export const RangeContext: Context<Map<number, AccessType>> = createContext(new Map());