/// <reference types="vite/client" />

declare module "mammoth/mammoth.browser" {
  export function convertToHtml(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<{ value: string; messages: Array<{ message: string }> }>;

  const mammoth: {
    convertToHtml: typeof convertToHtml;
  };

  export default mammoth;
}
