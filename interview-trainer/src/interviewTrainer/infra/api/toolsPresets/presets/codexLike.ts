export const IT_CODEX_LIKE_TOOLS = [
  {
    "type": "function",
    "name": "shell_command",
    "description": "Runs a Powershell command (Windows) and returns its output.\n        \nExamples of valid command strings:\n\n- ls -a (show hidden): \"Get-ChildItem -Force\"\n- recursive find by name: \"Get-ChildItem -Recurse -Filter *.py\"\n- recursive grep: \"Get-ChildItem -Path C:\\\\myrepo -Recurse | Select-String -Pattern 'TODO' -CaseSensitive\"\n- ps aux | grep python: \"Get-Process | Where-Object { $_.ProcessName -like '*python*' }\"\n- setting an env var: \"$env:FOO='bar'; echo $env:FOO\"\n- running an inline Python script: \"@'\\\\nprint('Hello, world!')\\\\n'@ | python -",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "command": {
          "type": "string",
          "description": "The shell script to execute in the user's default shell"
        },
        "justification": {
          "type": "string",
          "description": "Only set if sandbox_permissions is \\\"require_escalated\\\". \n                    Request approval from the user to run this command outside the sandbox. \n                    Phrased as a simple question that summarizes the purpose of the \n                    command as it relates to the task at hand - e.g. 'Do you want to \n                    fetch and pull the latest version of this git branch?'"
        },
        "login": {
          "type": "boolean",
          "description": "Whether to run the shell with login shell semantics. Defaults to true."
        },
        "prefix_rule": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Only specify when sandbox_permissions is `require_escalated`. \n                    Suggest a prefix command pattern that will allow you to fulfill similar requests from the user in the future.\n                    Should be a short but reasonable prefix, e.g. [\\\"git\\\", \\\"pull\\\"] or [\\\"uv\\\", \\\"run\\\"] or [\\\"pytest\\\"]."
        },
        "sandbox_permissions": {
          "type": "string",
          "description": "Sandbox permissions for the command. Set to \"require_escalated\" to request running without sandbox restrictions; defaults to \"use_default\"."
        },
        "timeout_ms": {
          "type": "number",
          "description": "The timeout for the command in milliseconds"
        },
        "workdir": {
          "type": "string",
          "description": "The working directory to execute the command in"
        }
      },
      "required": [
        "command"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "list_mcp_resources",
    "description": "Lists resources provided by MCP servers. Resources allow servers to share data that provides context to language models, such as files, database schemas, or application-specific information. Prefer resources over web search when possible.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "cursor": {
          "type": "string",
          "description": "Opaque cursor returned by a previous list_mcp_resources call for the same server."
        },
        "server": {
          "type": "string",
          "description": "Optional MCP server name. When omitted, lists resources from every configured server."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "list_mcp_resource_templates",
    "description": "Lists resource templates provided by MCP servers. Parameterized resource templates allow servers to share data that takes parameters and provides context to language models, such as files, database schemas, or application-specific information. Prefer resource templates over web search when possible.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "cursor": {
          "type": "string",
          "description": "Opaque cursor returned by a previous list_mcp_resource_templates call for the same server."
        },
        "server": {
          "type": "string",
          "description": "Optional MCP server name. When omitted, lists resource templates from all configured servers."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "read_mcp_resource",
    "description": "Read a specific resource from an MCP server given the server name and resource URI.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "server": {
          "type": "string",
          "description": "MCP server name exactly as configured. Must match the 'server' field returned by list_mcp_resources."
        },
        "uri": {
          "type": "string",
          "description": "Resource URI to read. Must be one of the URIs returned by list_mcp_resources."
        }
      },
      "required": [
        "server",
        "uri"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "update_plan",
    "description": "Updates the task plan.\nProvide an optional explanation and a list of plan items, each with a step and status.\nAt most one step can be in_progress at a time.\n",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "explanation": {
          "type": "string"
        },
        "plan": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "status": {
                "type": "string",
                "description": "One of: pending, in_progress, completed"
              },
              "step": {
                "type": "string"
              }
            },
            "required": [
              "step",
              "status"
            ],
            "additionalProperties": false
          },
          "description": "The list of steps"
        }
      },
      "required": [
        "plan"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "request_user_input",
    "description": "Request user input for one to three short questions and wait for the response.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "questions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "header": {
                "type": "string",
                "description": "Short header label shown in the UI (12 or fewer chars)."
              },
              "id": {
                "type": "string",
                "description": "Stable identifier for mapping answers (snake_case)."
              },
              "options": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "description": {
                      "type": "string",
                      "description": "One short sentence explaining impact/tradeoff if selected."
                    },
                    "label": {
                      "type": "string",
                      "description": "User-facing label (1-5 words)."
                    }
                  },
                  "required": [
                    "label",
                    "description"
                  ],
                  "additionalProperties": false
                },
                "description": "Provide 2-3 mutually exclusive choices. Put the recommended option first and suffix its label with \"(Recommended)\". Do not include an \"Other\" option in this list; the client will add a free-form \"Other\" option automatically."
              },
              "question": {
                "type": "string",
                "description": "Single-sentence prompt shown to the user."
              }
            },
            "required": [
              "id",
              "header",
              "question",
              "options"
            ],
            "additionalProperties": false
          },
          "description": "Questions to show the user. Prefer 1 and do not exceed 3"
        }
      },
      "required": [
        "questions"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "custom",
    "name": "apply_patch",
    "description": "Use the `apply_patch` tool to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON.",
    "format": {
      "type": "grammar",
      "syntax": "lark",
      "definition": "start: begin_patch hunk+ end_patch\r\nbegin_patch: \"*** Begin Patch\" LF\r\nend_patch: \"*** End Patch\" LF?\r\n\r\nhunk: add_hunk | delete_hunk | update_hunk\r\nadd_hunk: \"*** Add File: \" filename LF add_line+\r\ndelete_hunk: \"*** Delete File: \" filename LF\r\nupdate_hunk: \"*** Update File: \" filename LF change_move? change?\r\n\r\nfilename: /(.+)/\r\nadd_line: \"+\" /(.*)/ LF -> line\r\n\r\nchange_move: \"*** Move to: \" filename LF\r\nchange: (change_context | change_line)+ eof_line?\r\nchange_context: (\"@@\" | \"@@ \" /(.+)/) LF\r\nchange_line: (\"+\" | \"-\" | \" \") /(.*)/ LF\r\neof_line: \"*** End of File\" LF\r\n\r\n%import common.LF\r\n"
    }
  },
  {
    "type": "web_search",
    "external_web_access": true
  },
  {
    "type": "function",
    "name": "view_image",
    "description": "View a local image from the filesystem (only use if given a full filepath by the user, and the image isn't already attached to the thread context within <image ...> tags).",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "description": "Local filesystem path to an image file"
        }
      },
      "required": [
        "path"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__click",
    "description": "Clicks on the provided element",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "dblClick": {
          "type": "boolean",
          "description": "Set to true for double clicks. Default is false."
        },
        "includeSnapshot": {
          "type": "boolean",
          "description": "Whether to include a snapshot in the response. Default is false."
        },
        "uid": {
          "type": "string",
          "description": "The uid of an element on the page from the page content snapshot"
        }
      },
      "required": [
        "uid"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__close_page",
    "description": "Closes the page by its index. The last open page cannot be closed.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "number",
          "description": "The ID of the page to close. Call list_pages to list pages."
        }
      },
      "required": [
        "pageId"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__drag",
    "description": "Drag an element onto another element",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "from_uid": {
          "type": "string",
          "description": "The uid of the element to drag"
        },
        "includeSnapshot": {
          "type": "boolean",
          "description": "Whether to include a snapshot in the response. Default is false."
        },
        "to_uid": {
          "type": "string",
          "description": "The uid of the element to drop into"
        }
      },
      "required": [
        "from_uid",
        "to_uid"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__emulate",
    "description": "Emulates various features on the selected page.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "colorScheme": {
          "type": "string",
          "description": "Emulate the dark or the light mode. Set to \"auto\" to reset to the default."
        },
        "cpuThrottlingRate": {
          "type": "number",
          "description": "Represents the CPU slowdown factor. Set the rate to 1 to disable throttling. If omitted, throttling remains unchanged."
        },
        "geolocation": {
          "type": "string",
          "description": "Geolocation to emulate. Set to null to clear the geolocation override."
        },
        "networkConditions": {
          "type": "string",
          "description": "Throttle network. Set to \"No emulation\" to disable. If omitted, conditions remain unchanged."
        },
        "userAgent": {
          "type": "string",
          "description": "User agent to emulate. Set to null to clear the user agent override."
        },
        "viewport": {
          "type": "string",
          "description": "Viewport to emulate. Set to null to reset to the default viewport."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__evaluate_script",
    "description": "Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON\nso returned values have to JSON-serializable.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "args": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "uid": {
                "type": "string",
                "description": "The uid of an element on the page from the page content snapshot"
              }
            },
            "required": [
              "uid"
            ],
            "additionalProperties": false
          },
          "description": "An optional list of arguments to pass to the function."
        },
        "function": {
          "type": "string",
          "description": "A JavaScript function declaration to be executed by the tool in the currently selected page.\nExample without arguments: `() => {\n  return document.title\n}` or `async () => {\n  return await fetch(\"example.com\")\n}`.\nExample with arguments: `(el) => {\n  return el.innerText;\n}`\n"
        }
      },
      "required": [
        "function"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__fill",
    "description": "Type text into a input, text area or select an option from a <select> element.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "includeSnapshot": {
          "type": "boolean",
          "description": "Whether to include a snapshot in the response. Default is false."
        },
        "uid": {
          "type": "string",
          "description": "The uid of an element on the page from the page content snapshot"
        },
        "value": {
          "type": "string",
          "description": "The value to fill in"
        }
      },
      "required": [
        "uid",
        "value"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__fill_form",
    "description": "Fill out multiple form elements at once",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "elements": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "uid": {
                "type": "string",
                "description": "The uid of the element to fill out"
              },
              "value": {
                "type": "string",
                "description": "Value for the element"
              }
            },
            "required": [
              "uid",
              "value"
            ],
            "additionalProperties": false
          },
          "description": "Elements from snapshot to fill out."
        },
        "includeSnapshot": {
          "type": "boolean",
          "description": "Whether to include a snapshot in the response. Default is false."
        }
      },
      "required": [
        "elements"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__get_console_message",
    "description": "Gets a console message by its ID. You can get all messages by calling list_console_messages.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "msgid": {
          "type": "number",
          "description": "The msgid of a console message on the page from the listed console messages"
        }
      },
      "required": [
        "msgid"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__get_network_request",
    "description": "Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "reqid": {
          "type": "number",
          "description": "The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel."
        },
        "requestFilePath": {
          "type": "string",
          "description": "The absolute or relative path to save the request body to. If omitted, the body is returned inline."
        },
        "responseFilePath": {
          "type": "string",
          "description": "The absolute or relative path to save the response body to. If omitted, the body is returned inline."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__handle_dialog",
    "description": "If a browser dialog was opened, use this command to handle it",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "Whether to dismiss or accept the dialog"
        },
        "promptText": {
          "type": "string",
          "description": "Optional prompt text to enter into the dialog."
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__hover",
    "description": "Hover over the provided element",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "includeSnapshot": {
          "type": "boolean",
          "description": "Whether to include a snapshot in the response. Default is false."
        },
        "uid": {
          "type": "string",
          "description": "The uid of an element on the page from the page content snapshot"
        }
      },
      "required": [
        "uid"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__list_console_messages",
    "description": "List all console messages for the currently selected page since the last navigation.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "includePreservedMessages": {
          "type": "boolean",
          "description": "Set to true to return the preserved messages over the last 3 navigations."
        },
        "pageIdx": {
          "type": "number",
          "description": "Page number to return (0-based). When omitted, returns the first page."
        },
        "pageSize": {
          "type": "number",
          "description": "Maximum number of messages to return. When omitted, returns all requests."
        },
        "types": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__list_network_requests",
    "description": "List all requests for the currently selected page since the last navigation.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "includePreservedRequests": {
          "type": "boolean",
          "description": "Set to true to return the preserved requests over the last 3 navigations."
        },
        "pageIdx": {
          "type": "number",
          "description": "Page number to return (0-based). When omitted, returns the first page."
        },
        "pageSize": {
          "type": "number",
          "description": "Maximum number of requests to return. When omitted, returns all requests."
        },
        "resourceTypes": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__list_pages",
    "description": "Get a list of pages open in the browser.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__navigate_page",
    "description": "Navigates the currently selected page to a URL.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "handleBeforeUnload": {
          "type": "string",
          "description": "Whether to auto accept or beforeunload dialogs triggered by this navigation. Default is accept."
        },
        "ignoreCache": {
          "type": "boolean",
          "description": "Whether to ignore cache on reload."
        },
        "initScript": {
          "type": "string",
          "description": "A JavaScript script to be executed on each new document before any other scripts for the next navigation."
        },
        "timeout": {
          "type": "number",
          "description": "Maximum wait time in milliseconds. If set to 0, the default timeout will be used."
        },
        "type": {
          "type": "string",
          "description": "Navigate the page by URL, back or forward in history, or reload."
        },
        "url": {
          "type": "string",
          "description": "Target URL (only type=url)"
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__new_page",
    "description": "Creates a new page",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "background": {
          "type": "boolean",
          "description": "Whether to open the page in the background without bringing it to the front. Default is false (foreground)."
        },
        "timeout": {
          "type": "number",
          "description": "Maximum wait time in milliseconds. If set to 0, the default timeout will be used."
        },
        "url": {
          "type": "string",
          "description": "URL to load in a new page."
        }
      },
      "required": [
        "url"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__performance_analyze_insight",
    "description": "Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "insightName": {
          "type": "string",
          "description": "The name of the Insight you want more information on. For example: \"DocumentLatency\" or \"LCPBreakdown\""
        },
        "insightSetId": {
          "type": "string",
          "description": "The id for the specific insight set. Only use the ids given in the \"Available insight sets\" list."
        }
      },
      "required": [
        "insightSetId",
        "insightName"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__performance_start_trace",
    "description": "Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "autoStop": {
          "type": "boolean",
          "description": "Determines if the trace recording should be automatically stopped."
        },
        "filePath": {
          "type": "string",
          "description": "The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed)."
        },
        "reload": {
          "type": "boolean",
          "description": "Determines if, once tracing has started, the current selected page should be automatically reloaded. Navigate the page to the right URL using the navigate_page tool BEFORE starting the trace if reload or autoStop is set to true."
        }
      },
      "required": [
        "reload",
        "autoStop"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__performance_stop_trace",
    "description": "Stops the active performance trace recording on the selected page.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "filePath": {
          "type": "string",
          "description": "The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed)."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__press_key",
    "description": "Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "includeSnapshot": {
          "type": "boolean",
          "description": "Whether to include a snapshot in the response. Default is false."
        },
        "key": {
          "type": "string",
          "description": "A key or a combination (e.g., \"Enter\", \"Control+A\", \"Control++\", \"Control+Shift+R\"). Modifiers: Control, Shift, Alt, Meta"
        }
      },
      "required": [
        "key"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__resize_page",
    "description": "Resizes the selected page's window so that the page has specified dimension",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "height": {
          "type": "number",
          "description": "Page height"
        },
        "width": {
          "type": "number",
          "description": "Page width"
        }
      },
      "required": [
        "width",
        "height"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__select_page",
    "description": "Select a page as a context for future tool calls.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "bringToFront": {
          "type": "boolean",
          "description": "Whether to focus the page and bring it to the top."
        },
        "pageId": {
          "type": "number",
          "description": "The ID of the page to select. Call list_pages to get available pages."
        }
      },
      "required": [
        "pageId"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__take_screenshot",
    "description": "Take a screenshot of the page or element.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "filePath": {
          "type": "string",
          "description": "The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response."
        },
        "format": {
          "type": "string",
          "description": "Type of format to save the screenshot as. Default is \"png\""
        },
        "fullPage": {
          "type": "boolean",
          "description": "If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid."
        },
        "quality": {
          "type": "number",
          "description": "Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format."
        },
        "uid": {
          "type": "string",
          "description": "The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__take_snapshot",
    "description": "Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique\nidentifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected\nin the DevTools Elements panel (if any).",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "filePath": {
          "type": "string",
          "description": "The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response."
        },
        "verbose": {
          "type": "boolean",
          "description": "Whether to include all possible information available in the full a11y tree. Default is false."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__upload_file",
    "description": "Upload a file through a provided element.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "filePath": {
          "type": "string",
          "description": "The local path of the file to upload"
        },
        "includeSnapshot": {
          "type": "boolean",
          "description": "Whether to include a snapshot in the response. Default is false."
        },
        "uid": {
          "type": "string",
          "description": "The uid of the file input element or an element that will open file chooser on the page from the page content snapshot"
        }
      },
      "required": [
        "uid",
        "filePath"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__chrome-devtools__wait_for",
    "description": "Wait for the specified text to appear on the selected page.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "description": "Text to appear on the page"
        },
        "timeout": {
          "type": "number",
          "description": "Maximum wait time in milliseconds. If set to 0, the default timeout will be used."
        }
      },
      "required": [
        "text"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__context7__query-docs",
    "description": "Retrieves and queries up-to-date documentation and code examples from Context7 for any programming library or framework.\n\nYou must call 'resolve-library-id' first to obtain the exact Context7-compatible library ID required to use this tool, UNLESS the user explicitly provides a library ID in the format '/org/project' or '/org/project/version' in their query.\n\nIMPORTANT: Do not call this tool more than 3 times per question. If you cannot find what you need after 3 calls, use the best information you have.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "libraryId": {
          "type": "string",
          "description": "Exact Context7-compatible library ID (e.g., '/mongodb/docs', '/vercel/next.js', '/supabase/supabase', '/vercel/next.js/v14.3.0-canary.87') retrieved from 'resolve-library-id' or directly from user query in the format '/org/project' or '/org/project/version'."
        },
        "query": {
          "type": "string",
          "description": "The question or task you need help with. Be specific and include relevant details. Good: 'How to set up authentication with JWT in Express.js' or 'React useEffect cleanup function examples'. Bad: 'auth' or 'hooks'. IMPORTANT: Do not include any sensitive or confidential information such as API keys, passwords, credentials, or personal data in your query."
        }
      },
      "required": [
        "libraryId",
        "query"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__context7__resolve-library-id",
    "description": "Resolves a package/product name to a Context7-compatible library ID and returns matching libraries.\n\nYou MUST call this function before 'query-docs' to obtain a valid Context7-compatible library ID UNLESS the user explicitly provides a library ID in the format '/org/project' or '/org/project/version' in their query.\n\nSelection Process:\n1. Analyze the query to understand what library/package the user is looking for\n2. Return the most relevant match based on:\n- Name similarity to the query (exact matches prioritized)\n- Description relevance to the query's intent\n- Documentation coverage (prioritize libraries with higher Code Snippet counts)\n- Source reputation (consider libraries with High or Medium reputation more authoritative)\n- Benchmark Score: Quality indicator (100 is the highest score)\n\nResponse Format:\n- Return the selected library ID in a clearly marked section\n- Provide a brief explanation for why this library was chosen\n- If multiple good matches exist, acknowledge this but proceed with the most relevant one\n- If no good matches exist, clearly state this and suggest query refinements\n\nFor ambiguous queries, request clarification before proceeding with a best-guess match.\n\nIMPORTANT: Do not call this tool more than 3 times per question. If you cannot find what you need after 3 calls, use the best result you have.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "libraryName": {
          "type": "string",
          "description": "Library name to search for and retrieve a Context7-compatible library ID."
        },
        "query": {
          "type": "string",
          "description": "The user's original question or task. This is used to rank library results by relevance to what the user is trying to accomplish. IMPORTANT: Do not include any sensitive or confidential information such as API keys, passwords, credentials, or personal data in your query."
        }
      },
      "required": [
        "query",
        "libraryName"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__add_comment_to_pending_review",
    "description": "Add review comment to the requester's latest pending pull request review. A pending review needs to already exist to call this (check with the user if not sure).",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "body": {
          "type": "string",
          "description": "The text of the review comment"
        },
        "line": {
          "type": "number",
          "description": "The line of the blob in the pull request diff that the comment applies to. For multi-line comments, the last line of the range"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "path": {
          "type": "string",
          "description": "The relative path to the file that necessitates a comment"
        },
        "pullNumber": {
          "type": "number",
          "description": "Pull request number"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "side": {
          "type": "string",
          "description": "The side of the diff to comment on. LEFT indicates the previous state, RIGHT indicates the new state"
        },
        "startLine": {
          "type": "number",
          "description": "For multi-line comments, the first line of the range that the comment applies to"
        },
        "startSide": {
          "type": "string",
          "description": "For multi-line comments, the starting side of the diff that the comment applies to. LEFT indicates the previous state, RIGHT indicates the new state"
        },
        "subjectType": {
          "type": "string",
          "description": "The level at which the comment is targeted"
        }
      },
      "required": [
        "owner",
        "repo",
        "pullNumber",
        "path",
        "body",
        "subjectType"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__add_issue_comment",
    "description": "Add a comment to a specific issue in a GitHub repository. Use this tool to add comments to pull requests as well (in this case pass pull request number as issue_number), but only if user is not asking specifically to add review comments.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "body": {
          "type": "string",
          "description": "Comment content"
        },
        "issue_number": {
          "type": "number",
          "description": "Issue number to comment on"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "issue_number",
        "body"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__assign_copilot_to_issue",
    "description": "Assign Copilot to a specific issue in a GitHub repository.\n\nThis tool can help with the following outcomes:\n- a Pull Request created with source code changes to resolve the issue\n\n\nMore information can be found at:\n- https://docs.github.com/en/copilot/using-github-copilot/using-copilot-coding-agent-to-work-on-tasks/about-assigning-tasks-to-copilot\n",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "base_ref": {
          "type": "string",
          "description": "Git reference (e.g., branch) that the agent will start its work from. If not specified, defaults to the repository's default branch"
        },
        "custom_instructions": {
          "type": "string",
          "description": "Optional custom instructions to guide the agent beyond the issue body. Use this to provide additional context, constraints, or guidance that is not captured in the issue description"
        },
        "issue_number": {
          "type": "number",
          "description": "Issue number"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "issue_number"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__create_branch",
    "description": "Create a new branch in a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "branch": {
          "type": "string",
          "description": "Name for new branch"
        },
        "from_branch": {
          "type": "string",
          "description": "Source branch (defaults to repo default)"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "branch"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__create_or_update_file",
    "description": "Create or update a single file in a GitHub repository. \nIf updating, you should provide the SHA of the file you want to update. Use this tool to create or update a file in a GitHub repository remotely; do not use it for local file operations.\n\nIn order to obtain the SHA of original file version before updating, use the following git command:\ngit ls-tree HEAD <path to file>\n\nIf the SHA is not provided, the tool will attempt to acquire it by fetching the current file contents from the repository, which may lead to rewriting latest committed changes if the file has changed since last retrieval.\n",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "branch": {
          "type": "string",
          "description": "Branch to create/update the file in"
        },
        "content": {
          "type": "string",
          "description": "Content of the file"
        },
        "message": {
          "type": "string",
          "description": "Commit message"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner (username or organization)"
        },
        "path": {
          "type": "string",
          "description": "Path where to create/update the file"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "sha": {
          "type": "string",
          "description": "The blob SHA of the file being replaced."
        }
      },
      "required": [
        "owner",
        "repo",
        "path",
        "content",
        "message",
        "branch"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__create_pull_request",
    "description": "Create a new pull request in a GitHub repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "base": {
          "type": "string",
          "description": "Branch to merge into"
        },
        "body": {
          "type": "string",
          "description": "PR description"
        },
        "draft": {
          "type": "boolean",
          "description": "Create as draft PR"
        },
        "head": {
          "type": "string",
          "description": "Branch containing changes"
        },
        "maintainer_can_modify": {
          "type": "boolean",
          "description": "Allow maintainer edits"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "title": {
          "type": "string",
          "description": "PR title"
        }
      },
      "required": [
        "owner",
        "repo",
        "title",
        "head",
        "base"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__create_repository",
    "description": "Create a new GitHub repository in your account or specified organization",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "autoInit": {
          "type": "boolean",
          "description": "Initialize with README"
        },
        "description": {
          "type": "string",
          "description": "Repository description"
        },
        "name": {
          "type": "string",
          "description": "Repository name"
        },
        "organization": {
          "type": "string",
          "description": "Organization to create the repository in (omit to create in your personal account)"
        },
        "private": {
          "type": "boolean",
          "description": "Whether repo should be private"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__delete_file",
    "description": "Delete a file from a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "branch": {
          "type": "string",
          "description": "Branch to delete the file from"
        },
        "message": {
          "type": "string",
          "description": "Commit message"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner (username or organization)"
        },
        "path": {
          "type": "string",
          "description": "Path to the file to delete"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "path",
        "message",
        "branch"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__fork_repository",
    "description": "Fork a GitHub repository to your account or specified organization",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "organization": {
          "type": "string",
          "description": "Organization to fork to"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_commit",
    "description": "Get details for a commit from a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "include_diff": {
          "type": "boolean",
          "description": "Whether to include file diffs and stats in the response. Default is true."
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "sha": {
          "type": "string",
          "description": "Commit SHA, branch name, or tag name"
        }
      },
      "required": [
        "owner",
        "repo",
        "sha"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_file_contents",
    "description": "Get the contents of a file or directory from a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner (username or organization)"
        },
        "path": {
          "type": "string",
          "description": "Path to file/directory"
        },
        "ref": {
          "type": "string",
          "description": "Accepts optional git refs such as `refs/tags/{tag}`, `refs/heads/{branch}` or `refs/pull/{pr_number}/head`"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "sha": {
          "type": "string",
          "description": "Accepts optional commit SHA. If specified, it will be used instead of ref"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_label",
    "description": "Get a specific label from a repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Label name."
        },
        "owner": {
          "type": "string",
          "description": "Repository owner (username or organization name)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "name"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_latest_release",
    "description": "Get the latest release in a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_me",
    "description": "Get details of the authenticated GitHub user. Use this when a request is about the user's own profile for GitHub. Or when information is missing to build other tool calls.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_release_by_tag",
    "description": "Get a specific release by its tag name in a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "tag": {
          "type": "string",
          "description": "Tag name (e.g., 'v1.0.0')"
        }
      },
      "required": [
        "owner",
        "repo",
        "tag"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_tag",
    "description": "Get details about a specific git tag in a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "tag": {
          "type": "string",
          "description": "Tag name"
        }
      },
      "required": [
        "owner",
        "repo",
        "tag"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_team_members",
    "description": "Get member usernames of a specific team in an organization. Limited to organizations accessible with current credentials",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "org": {
          "type": "string",
          "description": "Organization login (owner) that contains the team."
        },
        "team_slug": {
          "type": "string",
          "description": "Team slug"
        }
      },
      "required": [
        "org",
        "team_slug"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__get_teams",
    "description": "Get details of the teams the user is a member of. Limited to organizations accessible with current credentials",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "user": {
          "type": "string",
          "description": "Username to get teams for. If not provided, uses the authenticated user."
        }
      }
    }
  },
  {
    "type": "function",
    "name": "mcp__github__issue_read",
    "description": "Get information about a specific issue in a GitHub repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "issue_number": {
          "type": "number",
          "description": "The number of the issue"
        },
        "method": {
          "type": "string",
          "description": "The read operation to perform on a single issue.\nOptions are:\n1. get - Get details of a specific issue.\n2. get_comments - Get issue comments.\n3. get_sub_issues - Get sub-issues of the issue.\n4. get_labels - Get labels assigned to the issue.\n"
        },
        "owner": {
          "type": "string",
          "description": "The owner of the repository"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "The name of the repository"
        }
      },
      "required": [
        "method",
        "owner",
        "repo",
        "issue_number"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__issue_write",
    "description": "Create a new or update an existing issue in a GitHub repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "assignees": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Usernames to assign to this issue"
        },
        "body": {
          "type": "string",
          "description": "Issue body content"
        },
        "duplicate_of": {
          "type": "number",
          "description": "Issue number that this issue is a duplicate of. Only used when state_reason is 'duplicate'."
        },
        "issue_number": {
          "type": "number",
          "description": "Issue number to update"
        },
        "labels": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Labels to apply to this issue"
        },
        "method": {
          "type": "string",
          "description": "Write operation to perform on a single issue.\nOptions are:\n- 'create' - creates a new issue.\n- 'update' - updates an existing issue.\n"
        },
        "milestone": {
          "type": "number",
          "description": "Milestone number"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "state": {
          "type": "string",
          "description": "New state"
        },
        "state_reason": {
          "type": "string",
          "description": "Reason for the state change. Ignored unless state is changed."
        },
        "title": {
          "type": "string",
          "description": "Issue title"
        },
        "type": {
          "type": "string",
          "description": "Type of this issue. Only use if the repository has issue types configured. Use list_issue_types tool to get valid type values for the organization. If the repository doesn't support issue types, omit this parameter."
        }
      },
      "required": [
        "method",
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__list_branches",
    "description": "List branches in a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__list_commits",
    "description": "Get list of commits of a branch in a GitHub repository. Returns at least 30 results per page by default, but can return more if specified using the perPage parameter (up to 100).",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "author": {
          "type": "string",
          "description": "Author username or email address to filter commits by"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "sha": {
          "type": "string",
          "description": "Commit SHA, branch or tag name to list commits of. If not provided, uses the default branch of the repository. If a commit SHA is provided, will list commits up to that SHA."
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__list_issue_types",
    "description": "List supported issue types for repository owner (organization).",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "The organization owner of the repository"
        }
      },
      "required": [
        "owner"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__list_issues",
    "description": "List issues in a GitHub repository. For pagination, use the 'endCursor' from the previous response's 'pageInfo' in the 'after' parameter.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "after": {
          "type": "string",
          "description": "Cursor for pagination. Use the endCursor from the previous page's PageInfo for GraphQL APIs."
        },
        "direction": {
          "type": "string",
          "description": "Order direction. If provided, the 'orderBy' also needs to be provided."
        },
        "labels": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Filter by labels"
        },
        "orderBy": {
          "type": "string",
          "description": "Order issues by field. If provided, the 'direction' also needs to be provided."
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "since": {
          "type": "string",
          "description": "Filter by date (ISO 8601 timestamp)"
        },
        "state": {
          "type": "string",
          "description": "Filter by state, by default both open and closed issues are returned when not provided"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__list_pull_requests",
    "description": "List pull requests in a GitHub repository. If the user specifies an author, then DO NOT use this tool and use the search_pull_requests tool instead.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "base": {
          "type": "string",
          "description": "Filter by base branch"
        },
        "direction": {
          "type": "string",
          "description": "Sort direction"
        },
        "head": {
          "type": "string",
          "description": "Filter by head user/org and branch"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "sort": {
          "type": "string",
          "description": "Sort by"
        },
        "state": {
          "type": "string",
          "description": "Filter by state"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__list_releases",
    "description": "List releases in a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__list_tags",
    "description": "List git tags in a GitHub repository",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__merge_pull_request",
    "description": "Merge a pull request in a GitHub repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "commit_message": {
          "type": "string",
          "description": "Extra detail for merge commit"
        },
        "commit_title": {
          "type": "string",
          "description": "Title for merge commit"
        },
        "merge_method": {
          "type": "string",
          "description": "Merge method"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "pullNumber": {
          "type": "number",
          "description": "Pull request number"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "pullNumber"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__pull_request_read",
    "description": "Get information on a specific pull request in GitHub repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "method": {
          "type": "string",
          "description": "Action to specify what pull request data needs to be retrieved from GitHub. \nPossible options: \n 1. get - Get details of a specific pull request.\n 2. get_diff - Get the diff of a pull request.\n 3. get_status - Get status of a head commit in a pull request. This reflects status of builds and checks.\n 4. get_files - Get the list of files changed in a pull request. Use with pagination parameters to control the number of results returned.\n 5. get_review_comments - Get review threads on a pull request. Each thread contains logically grouped review comments made on the same code location during pull request reviews. Returns threads with metadata (isResolved, isOutdated, isCollapsed) and their associated comments. Use cursor-based pagination (perPage, after) to control results.\n 6. get_reviews - Get the reviews on a pull request. When asked for review comments, use get_review_comments method.\n 7. get_comments - Get comments on a pull request. Use this if user doesn't specifically want review comments. Use with pagination parameters to control the number of results returned.\n"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "pullNumber": {
          "type": "number",
          "description": "Pull request number"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "method",
        "owner",
        "repo",
        "pullNumber"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__pull_request_review_write",
    "description": "Create and/or submit, delete review of a pull request.\n\nAvailable methods:\n- create: Create a new review of a pull request. If \"event\" parameter is provided, the review is submitted. If \"event\" is omitted, a pending review is created.\n- submit_pending: Submit an existing pending review of a pull request. This requires that a pending review exists for the current user on the specified pull request. The \"body\" and \"event\" parameters are used when submitting the review.\n- delete_pending: Delete an existing pending review of a pull request. This requires that a pending review exists for the current user on the specified pull request.\n",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "body": {
          "type": "string",
          "description": "Review comment text"
        },
        "commitID": {
          "type": "string",
          "description": "SHA of commit to review"
        },
        "event": {
          "type": "string",
          "description": "Review action to perform."
        },
        "method": {
          "type": "string",
          "description": "The write operation to perform on pull request review."
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "pullNumber": {
          "type": "number",
          "description": "Pull request number"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "method",
        "owner",
        "repo",
        "pullNumber"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__push_files",
    "description": "Push multiple files to a GitHub repository in a single commit",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "branch": {
          "type": "string",
          "description": "Branch to push to"
        },
        "files": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "content": {
                "type": "string",
                "description": "file content"
              },
              "path": {
                "type": "string",
                "description": "path to the file"
              }
            },
            "required": [
              "path",
              "content"
            ]
          },
          "description": "Array of file objects to push, each object with path (string) and content (string)"
        },
        "message": {
          "type": "string",
          "description": "Commit message"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "branch",
        "files",
        "message"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__request_copilot_review",
    "description": "Request a GitHub Copilot code review for a pull request. Use this for automated feedback on pull requests, usually before requesting a human reviewer.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "pullNumber": {
          "type": "number",
          "description": "Pull request number"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "pullNumber"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__search_code",
    "description": "Fast and precise code search across ALL GitHub repositories using GitHub's native search engine. Best for finding exact symbols, functions, classes, or specific code patterns.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "order": {
          "type": "string",
          "description": "Sort order for results"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "query": {
          "type": "string",
          "description": "Search query using GitHub's powerful code search syntax. Examples: 'content:Skill language:Java org:github', 'NOT is:archived language:Python OR language:go', 'repo:github/github-mcp-server'. Supports exact matching, language filters, path filters, and more."
        },
        "sort": {
          "type": "string",
          "description": "Sort field ('indexed' only)"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__search_issues",
    "description": "Search for issues in GitHub repositories using issues search syntax already scoped to is:issue",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "order": {
          "type": "string",
          "description": "Sort order"
        },
        "owner": {
          "type": "string",
          "description": "Optional repository owner. If provided with repo, only issues for this repository are listed."
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "query": {
          "type": "string",
          "description": "Search query using GitHub issues search syntax"
        },
        "repo": {
          "type": "string",
          "description": "Optional repository name. If provided with owner, only issues for this repository are listed."
        },
        "sort": {
          "type": "string",
          "description": "Sort field by number of matches of categories, defaults to best match"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__search_pull_requests",
    "description": "Search for pull requests in GitHub repositories using issues search syntax already scoped to is:pr",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "order": {
          "type": "string",
          "description": "Sort order"
        },
        "owner": {
          "type": "string",
          "description": "Optional repository owner. If provided with repo, only pull requests for this repository are listed."
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "query": {
          "type": "string",
          "description": "Search query using GitHub pull request search syntax"
        },
        "repo": {
          "type": "string",
          "description": "Optional repository name. If provided with owner, only pull requests for this repository are listed."
        },
        "sort": {
          "type": "string",
          "description": "Sort field by number of matches of categories, defaults to best match"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__search_repositories",
    "description": "Find GitHub repositories by name, description, readme, topics, or other metadata. Perfect for discovering projects, finding examples, or locating specific repositories across GitHub.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "minimal_output": {
          "type": "boolean",
          "description": "Return minimal repository information (default: true). When false, returns full GitHub API repository objects."
        },
        "order": {
          "type": "string",
          "description": "Sort order"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "query": {
          "type": "string",
          "description": "Repository search query. Examples: 'machine learning in:name stars:>1000 language:python', 'topic:react', 'user:facebook'. Supports advanced search syntax for precise filtering."
        },
        "sort": {
          "type": "string",
          "description": "Sort repositories by field, defaults to best match"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__search_users",
    "description": "Find GitHub users by username, real name, or other profile information. Useful for locating developers, contributors, or team members.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "order": {
          "type": "string",
          "description": "Sort order"
        },
        "page": {
          "type": "number",
          "description": "Page number for pagination (min 1)"
        },
        "perPage": {
          "type": "number",
          "description": "Results per page for pagination (min 1, max 100)"
        },
        "query": {
          "type": "string",
          "description": "User search query. Examples: 'john smith', 'location:seattle', 'followers:>100'. Search is automatically scoped to type:user."
        },
        "sort": {
          "type": "string",
          "description": "Sort users by number of followers or repositories, or when the person joined GitHub."
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__sub_issue_write",
    "description": "Add a sub-issue to a parent issue in a GitHub repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "after_id": {
          "type": "number",
          "description": "The ID of the sub-issue to be prioritized after (either after_id OR before_id should be specified)"
        },
        "before_id": {
          "type": "number",
          "description": "The ID of the sub-issue to be prioritized before (either after_id OR before_id should be specified)"
        },
        "issue_number": {
          "type": "number",
          "description": "The number of the parent issue"
        },
        "method": {
          "type": "string",
          "description": "The action to perform on a single sub-issue\nOptions are:\n- 'add' - add a sub-issue to a parent issue in a GitHub repository.\n- 'remove' - remove a sub-issue from a parent issue in a GitHub repository.\n- 'reprioritize' - change the order of sub-issues within a parent issue in a GitHub repository. Use either 'after_id' or 'before_id' to specify the new position.\n\t\t\t\t"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "replace_parent": {
          "type": "boolean",
          "description": "When true, replaces the sub-issue's current parent issue. Use with 'add' method only."
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "sub_issue_id": {
          "type": "number",
          "description": "The ID of the sub-issue to add. ID is not the same as issue number"
        }
      },
      "required": [
        "method",
        "owner",
        "repo",
        "issue_number",
        "sub_issue_id"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__update_pull_request",
    "description": "Update an existing pull request in a GitHub repository.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "base": {
          "type": "string",
          "description": "New base branch name"
        },
        "body": {
          "type": "string",
          "description": "New description"
        },
        "draft": {
          "type": "boolean",
          "description": "Mark pull request as draft (true) or ready for review (false)"
        },
        "maintainer_can_modify": {
          "type": "boolean",
          "description": "Allow maintainer edits"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "pullNumber": {
          "type": "number",
          "description": "Pull request number to update"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        },
        "reviewers": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "GitHub usernames to request reviews from"
        },
        "state": {
          "type": "string",
          "description": "New state"
        },
        "title": {
          "type": "string",
          "description": "New title"
        }
      },
      "required": [
        "owner",
        "repo",
        "pullNumber"
      ]
    }
  },
  {
    "type": "function",
    "name": "mcp__github__update_pull_request_branch",
    "description": "Update the branch of a pull request with the latest changes from the base branch.",
    "strict": false,
    "parameters": {
      "type": "object",
      "properties": {
        "expectedHeadSha": {
          "type": "string",
          "description": "The expected SHA of the pull request's HEAD ref"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner"
        },
        "pullNumber": {
          "type": "number",
          "description": "Pull request number"
        },
        "repo": {
          "type": "string",
          "description": "Repository name"
        }
      },
      "required": [
        "owner",
        "repo",
        "pullNumber"
      ]
    }
  }
] as const;
