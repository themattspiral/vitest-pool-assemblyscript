function overflow(inputNumber) {
  return 1 + overflow(inputNumber);
}

export default function createWasmImports({ memory, module, utils }) {
  return {
    customUserModule: {},

    anotherCustomUserModule: {
      yetAnotherFunction: (inputNumber) => {
        return inputNumber * 10;
      },
    },
  };
};
