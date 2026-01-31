export default function createWasmImports({ memory, module, utils }) {
  return {
    env: {
      myUserFunction: (inputNumber) => {
        return inputNumber + 10;
      }
    },

    customUserModule: {
      otherFunction: (inputNumber) => {
        return inputNumber * 10;
      },
    },

    'user-import-wrapper.help': {
      parseIntStringFunction: (inputStrPtr) => {
        const str = utils.liftString(inputStrPtr);
        return parseInt(str);
      }
    }
  };
};
