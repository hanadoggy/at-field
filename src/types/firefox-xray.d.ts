// Firefox content script 전용 X-ray 언랩
export type XrayWrapped<T> = T & { wrappedJSObject?: T };
