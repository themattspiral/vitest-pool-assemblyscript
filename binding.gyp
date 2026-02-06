{
  "targets": [
    {
      "target_name": "wasm_binaryen_debug_instrumenter",
      "sources": [
        "src/instrumentation/native/addon.cpp"
      ],
      "include_dirs": [
        # node-addon-api C++ headers (N-API wrapper)
        "<!@(node -p \"require('node-addon-api').include\")",
        # Binaryen C++ API headers (downloaded by setup-binaryen.js)
        "third_party/binaryen/src"
      ],
      "defines": [
        # Use N-API error handling instead of C++ exceptions for addon API calls.
        # Our code still uses C++ exceptions internally (enabled per-platform below)
        # for Binaryen operations — those are caught and converted to N-API errors.
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        # Disable C++ assert() in release builds (Binaryen headers use these)
        "NDEBUG"
      ],
      "conditions": [
        ["OS=='linux'", {
          "libraries": [
            "<(module_root_dir)/third_party/binaryen/lib/libbinaryen.a",
            # Required for std::thread usage in Binaryen
            "-lpthread"
          ],
          # Enable C++ exceptions (node-gyp disables them by default)
          "cflags_cc": ["-std=c++17", "-fexceptions", "-O3"],
          "cflags!": ["-fno-exceptions"],
          "cflags_cc!": ["-fno-exceptions"]
        }],
        ["OS=='mac'", {
          "libraries": [
            "<(module_root_dir)/third_party/binaryen/lib/libbinaryen.a"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            # Minimum macOS deployment target for C++17 support
            "MACOSX_DEPLOYMENT_TARGET": "10.15",
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-fexceptions", "-O3"]
          }
        }],
        ["OS=='win'", {
          # Windows uses .lib static library format
          "libraries": [
            "<(module_root_dir)/third_party/binaryen/lib/binaryen.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              # Enable C++ exception handling (/EHsc)
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17", "/permissive"]
            }
          }
        }]
      ]
    }
  ]
}
