export default class JSZip {
  file() {
    return this;
  }
  async generateAsync() {
    return new Blob(['fake-zip']);
  }
  async loadAsync() {
    return { files: {} };
  }
}
