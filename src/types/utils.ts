export type dynamic = {[key: string]: any };
export type dynamicStrObj = { [key: string]: string };
export type ValueOf<T> = T[keyof T];