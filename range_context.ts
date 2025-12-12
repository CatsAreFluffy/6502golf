import { Context, createContext } from "react";
import { AccessType } from "./machine";

export const RangeContext: Context<Map<number, AccessType>> = createContext(new Map());