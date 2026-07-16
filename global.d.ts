declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare global {
  type PromiseWithResolvers<T> = {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
  };
  interface PromiseConstructor {
    withResolvers<T>(): PromiseWithResolvers<T>;
  }
}
export {};
