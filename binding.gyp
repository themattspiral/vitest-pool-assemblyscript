{
  "targets": [
    {
      "target_name": "wasm_binaryen_debug",
      "sources": [
        "src/native/addon.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "third_party/binaryen/src"
      ],
      "libraries": [
        "<(module_root_dir)/third_party/binaryen/lib/libbinaryen.a",
        "-lpthread"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": [
        "-std=c++17",
        "-fexceptions"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_CPLUSPLUSFLAGS": [
          "-std=c++17",
          "-fexceptions"
        ]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": [
            "/std:c++17"
          ]
        }
      }
    }
  ]
}
