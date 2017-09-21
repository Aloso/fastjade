/**
 * Library for parsing strings with a jade-like syntax and inserting variables from a context.
 * @copyright Ludwig Stecher
 */

var FastJade = (function() {

    ////////////////////////////////   RESOURCES    ////////////////////////////////

    var selfClosingNodes = {
        "area": 1,
        "base": 1,
        "br": 1,
        "col": 1,
        "command": 1,
        "embed": 1,
        "hr": 1,
        "img": 1,
        "input": 1,
        "keygen": 1,
        "link": 1,
        "meta": 1,
        "param": 1,
        "source": 1,
        "track": 1,
        "wbr": 1
    };

    var doctypes = {
        "html": "<!DOCTYPE html>",
        "5": "<!DOCTYPE html>",
        "default": "<!DOCTYPE html>",
        "xml": "<?xml version=\"1.0\" encoding=\"utf-8\" ?>",
        "transitional": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\">",
        "strict": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Strict//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd\">",
        "frameset": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Frameset//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd\">",
        "1.1": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.1//EN\" \"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd\">",
        "basic": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML Basic 1.1//EN\" \"http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd\">",
        "mobile": "<!DOCTYPE html PUBLIC \"-//WAPFORUM//DTD XHTML Mobile 1.2//EN\" \"http://www.openmobilealliance.org/tech/DTD/xhtml-mobile12.dtd\">"
    };

    // Constants
    var T_STRING = 0,
        T_FINAL_STRING = 1,
        T_HTML_NODE = 2,
        T_HTML_COMMENT = 3,
        T_VARIABLE_JS = 4,
        T_VARIABLE_JS_ESC = 5,
        T_INJECTED_JS = 6,
        T_INCLUDE = 7,
        T_EXTEND = 8,
        T_BLOCK = 9;

    function addSlashes(string) {
        return string.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }

    function escapeHtml(unsafe) {
        return ("" + unsafe)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    }

    function objectToCssString(o) {
        if (typeof o === "string") return o;
        var vals = [];
        for (var key in o) if (o.hasOwnProperty(key)) {
            var keyTransformed = key.replace(/[A-Z]/g, function (match) {
                return "-" + match.toLowerCase();
            });
            vals.push(keyTransformed + ":" + o[key]);
        }
        return vals.join("; ");
    }

    /**
     * This is an object containing many regexes for testing.
     * In most cases, the search string has to be at the beginning of the haystack.
     * Usage:
     * <pre>     if (regexPool.doctype.test(myString)) ...     </pre>
     *
     * This is the fastest way to test if a haystack begins with a string.
     * There is one exception: if the search string is one character long, use
     *
     * <pre>     if (myString[0] === "a") ...                   </pre>
     */
    var regexPool = {
        all_vertical_tabs: /\r/g,       // match \r        (global)
        first_nw_char_or_endl: /\S|$/,  // match the first non-whitespace character or the end of the string
        first_nw_char: /\S/,            // match the first non-whitespace character
        empty_line: /^\s*$/,            // match a string that is empty or contains only whitespace
        leading_ws: /^\s*/,             // match the whitespace at the beginning of the string
        one_leading_ws: /^\s?/,         // match 0 or 1 whitespace characters at the beginning of the string
        trailing_ws: /\s*$/,            // match the whitespace at the end of the string
        
        doctype: /^doctype/,            // match doctype
        doctype_i: /^doctype/i,         // match doctype   (case-insensitive)
        em_equals: /^!=/,               // match !=
        em_brace: /^!{/,                // match !{
        hash_brace: /^#{/,              // match #{
        comment: /^\/\//,               // match //
        comment_dash: /^\/\/-/,         // match //-
        comment_plus_ws: /^\/\/\s*/,    // match // and additional whitespace
        dot_plus_ws: /^\.\s*/,          // match . and additional whitespace
        html_node: /^([a-z0-9_-]+)/i,   // match 1 or more node names
        
        filter_js: /^:javascript/,      //:javascript
        filter_js_plus_ws: /^:javascript\s*/,   //:javascript and additional whitespace
        
        // match 0 or more node names and 1 or more IDs/classes
        html_node_with_selectors: /^([a-z0-9_-]*)(([.#][a-z0-9\u00C0-\u024F_-]+)+)/i,
        
        //            attr name                   =    "string escaped "|'string escaped '|variable
        html_attr: /^([a-z0-9\u00C0-\u024F_-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-z0-9\u00C0-\u024F_-]+)/i,
        
        quoted_string: /^(".*?"|'.*?')/,
        quoted_string_esc: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
        quoted_string_esc_or_var: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-z0-9\u00C0-\u024F_]+)/i
    };


    //////////////////////////////// HELPER CLASSES ////////////////////////////////

    /**
     * @typedef {{
     *      content: Variable,
     *      children: Array.<SimpleNode>
     * }} SimpleNode
     */

    /**
     * @param {?} content
     * @param {int} indentLength
     * @param {Node?} parent
     * @constructor
     */
    function Node(content, indentLength, parent) {
        this.content = content;
        this.indentLength = indentLength;
        this.children = [];
        this.parent = parent;
    }

    /**
     * @param {Node|Variable|string} n
     * @param {int?} indentLength
     */
    Node.prototype.add = function (n, indentLength) {
        var child;
        if (n.indentLength) {
            child = n;
        } else {
            child = new Node(n, indentLength);
        }
        this.children.push(child);
        child.parent = this;
        return child;
    };
    /**
     * @param {Node|Variable|string} n
     * @param {int?} indentLength
     */
    Node.prototype.addOnlyParent = function (n, indentLength) {
        var child;
        if (n.indentLength) {
            child = n;
        } else {
            child = new Node(n, indentLength);
        }
        child.parent = this;
        return child;
    };

    var rootID = new Node(null, -1);
    delete rootID.indentLength;
    delete rootID.content;
    delete rootID.parent;

    Node.makeRoot = function () {
        var r = new Node(null, -1);
        r.parent = rootID;
        rootID.children.push(r);
        return r;
    };
    Node.prototype.isRoot = function () {
        return this.parent === rootID;
    };
    Node.prototype.isInTree = function () {
        if (this === rootID) return false;
        return this.isRoot() || this.parent.isInTree();
    };

    /** @return {SimpleNode} */
    Node.prototype.simplify = function () {
        var n = {content: this.content, children: []};
        for (var i = 0; i < this.children.length; i++) {
            n.children.push(this.children[i].simplify());
        }
        if (n.children.length === 0) delete n.children;
        return n;
    };

    function Variable(string, type) {
        this.val = string;
        this.type = type;
    }

    var contextValidationSecret = Math.random() + "";

    function PartsCombinator() {
        /** @type {Array.<Variable>} */
        var res = [];
        var last = null;
        var lastType = -1;
        
        this.add = function (val, type) {
            if (type === lastType && lastType === T_FINAL_STRING) {
                last.val += val;
            } else if (type !== T_FINAL_STRING || val !== "") {
                last = new Variable(val, type);
                lastType = type;
                res.push(last);
            }
        };
        /** @param {Array.<Variable>} valArr */
        this.addMany = function (valArr) {
            for (var i = 0; i < valArr.length; i++) {
                this.add(valArr[i].val, valArr[i].type);
            }
        };
        /**
         * Convert the parts into a STRING containing a function.
         * This STRING will then be converted to a function using eval()
         */
        this.createFunction = function () {
            var r = "function anonymous(context) {\n" +
                    "  with (context || {}) {\n" +
                    "    var _ = \"\";\n";
            var el, x;
            for (var i = 0; i < res.length; i++) {
                el = res[i];
                switch (el.type) {
                    case T_EXTEND:
                        throw new Error("extending is not supported in browsers!");
                    case T_FINAL_STRING:
                        r += "    _ += \"" + addSlashes(el.val).replace(/\n/g, "\\n") + "\";\n";
                        break;
                    case T_VARIABLE_JS_ESC:
                        x = el.val;
                        r += "    _ += (typeof "+ x + " === 'undefined') ? 'undefined' : escapeHtml(" + x + ");\n";
                        break;
                    case T_VARIABLE_JS:
                        x = el.val;
                        r += "    _ += (typeof "+ x + " === 'undefined') ? 'undefined' : " + x + ";\n";
                        break;
                    case T_INJECTED_JS:
                        r += "    " + el.val + "\n";
                        break;
                }
            }
            r += "    return _;\n";
            r += "  }\n";
            r += "}";
            return r;
        };
    }



    ////////////////////////////////    PROGRAM     ////////////////////////////////

    function _parse(string) {
        var lines = string.replace(/\r/g, "").split("\n");
        var resultTree = Node.makeRoot();
        
        /** @type {string} */
        var line, trimmedLine;
        /** @type {Node} */
        var lastNode = resultTree;
        /** @type {boolean} */
        var isText = false;
        /** @type {int} */
        var lastIndent = -1, textIndent = -1;
        /** @type {int} */
        var firstNWcharPos;
        
        //               tag          classes/IDs                     (    key                         =   value                                             )
        var nodeRegex = /[a-z0-9_-]*([.#][a-z0-9_\u00C0-\u024F-]+)*(\(\s*([a-z0-9_\u00C0-\u024F-]+\s*(=\s*("[^"]*?"|'[^']*?'|[a-z0-9_\u00C0-\u024F-])\s*)?)*\))?/i;
        
        for (var i = 0; i < lines.length; i++) {
            line = lines[i];
            
            if (isText) {
                firstNWcharPos = line.search(regexPool.first_nw_char_or_endl);
                if (textIndent === -1) {
                    if (line.length === firstNWcharPos) {
                        continue;
                    }
                    // first line in text block
                    if (firstNWcharPos > lastIndent) {
                        // define indent for text block
                        textIndent = firstNWcharPos;
                        line = line.substring(textIndent);
                        lastNode.add(new Variable(line, T_STRING), textIndent);
                    } else {
                        // indent too short; text block is empty
                        isText = false;
                    }
                    continue;
                } else if (firstNWcharPos >= textIndent) {
                    if (line.length === firstNWcharPos) {
                        continue;
                    }
                    // line is part of text block
                    line = line.substring(textIndent);
                    lastNode.add(new Variable(line, T_STRING), textIndent);
                    continue;
                } else if (line.length < textIndent && regexPool.empty_line.test(line)) {
                    // line is too short -> ignored
                    continue;
                } else {
                    // indent too short; line is not part of text block
                    isText = false;
                }
            }
            
            firstNWcharPos = line.search(regexPool.first_nw_char);
            if (firstNWcharPos === -1) continue;
            trimmedLine = line.substring(firstNWcharPos);
            
            /** @type {Node|undefined} */
            var nextParent;
            for (var tmp_node = lastNode; tmp_node !== undefined; tmp_node = tmp_node.parent) {
                if (tmp_node.indentLength < firstNWcharPos) {
                    nextParent = tmp_node;
                    break;
                }
            }
            
            if (trimmedLine[0] === "|") {
                // pipe (simple text)
                trimmedLine = trimmedLine.substring(1);
                if (trimmedLine[0] === " ") trimmedLine = trimmedLine.substring(1);
                nextParent.add(new Variable(trimmedLine, T_STRING), firstNWcharPos);
            } else if (trimmedLine[0] === "=") {
                // =
                nextParent.add(new Variable(trimmedLine.substring(1), T_VARIABLE_JS_ESC), firstNWcharPos);
            } else if (regexPool.em_equals.test(trimmedLine)) {
                // !=
                nextParent.add(new Variable(trimmedLine.substring(2), T_VARIABLE_JS), firstNWcharPos);
            } else if (regexPool.comment_dash.test(trimmedLine)) {
                // //- (invisible comment)
            } else if (regexPool.comment.test(trimmedLine)) {
                // // (html comment)
                lastNode = nextParent.add(new Variable("//", T_HTML_COMMENT), firstNWcharPos);
                var commentText = trimmedLine.replace(regexPool.comment_plus_ws, "");
                if (commentText !== "") {
                    lastNode.add(new Variable(commentText, T_FINAL_STRING));
                }
            } else if (regexPool.doctype.test(trimmedLine)) {
                // doctype
                var argsString = trimmedLine.substring(7);
                if (argsString !== "") {
                    var args = argsString.replace(/^s+|s+$/g, "").toLowerCase();
                    if (doctypes[args]) {
                        nextParent.add(new Variable(doctypes[args], T_FINAL_STRING), firstNWcharPos);
                    } else {
                        nextParent.add(new Variable("<!DOCTYPE " + argsString.replace(/^s+|s+$/g, "") + ">", T_FINAL_STRING), firstNWcharPos);
                    }
                } else {
                    nextParent.add(new Variable(doctypes["default"], T_FINAL_STRING), firstNWcharPos);
                }
            } else if (trimmedLine[0] === "-") {
                // javascript
                trimmedLine = trimmedLine.substring(1);
                lastNode = nextParent.add(new Variable(trimmedLine, T_INJECTED_JS), firstNWcharPos);
            } else if (regexPool.filter_js.test(trimmedLine)) {
                // javascript element
                trimmedLine = trimmedLine.replace(regexPool.filter_js_plus_ws, "");
                lastNode = nextParent.add(new Variable({
                    nodeName: "script",
                    args: "type=\"text/javascript\""
                }, T_HTML_NODE), firstNWcharPos);
                isText = true;
                textIndent = -1;
                lastIndent = firstNWcharPos;
            } else {
                // html element
                
                /** @type {Array|string} */
                var node = trimmedLine.match(nodeRegex);
                if (node !== null) {
                    node = node[0];
                    var nodeElem = parseNodeString(node);
                    var text = trimmedLine.substring(node.length);
                    
                    if (text[0] === "=") {
                        lastNode = nextParent.add(nodeElem, firstNWcharPos);
                        lastNode.add(new Variable(text.substring(1), T_VARIABLE_JS_ESC), 0);
                    } else if (regexPool.em_equals.test(text)) {
                        // !=
                        lastNode = nextParent.add(nodeElem, firstNWcharPos);
                        lastNode.add(new Variable(text.substring(2), T_VARIABLE_JS), 0);
                    } else if (text[0] === ".") {
                        isText = true;
                        textIndent = -1;
                        lastIndent = firstNWcharPos;
                        lastNode = nextParent.add(nodeElem, firstNWcharPos);
                        text = text.replace(regexPool.dot_plus_ws, "");
                        if (text !== "") lastNode.add(new Variable(text, T_STRING), 0);
                    } else {
                        lastNode = nextParent.add(nodeElem, firstNWcharPos);
                        if (text !== "") {
                            text = text.replace(regexPool.one_leading_ws, "");
                            lastNode.add(new Variable(text, T_STRING), 0);
                        }
                        
                        if (node === "script" || node === "style") {
                            isText = true;
                            textIndent = -1;
                            lastIndent = firstNWcharPos;
                        }
                        lastIndent = firstNWcharPos;
                    }
                } else {
                    // invalid node name, use text instead
                    nextParent.add(new Variable(trimmedLine, T_STRING), 0);
                }
            }
        }
        
        return resultTree.simplify();
    }


    /**
     * @param {string} string
     * @return {Variable}
     */
    function parseNodeString(string) {
        var nodeName = string;
        var args = "";
        var parenthesisPos = string.indexOf("(");
        if (parenthesisPos !== -1) {
            nodeName = string.substring(0, parenthesisPos);
            args = string.substring(parenthesisPos + 1);
            if (args[args.length - 1] === ")") {
                args = args.substring(0, args.length - 1);
            }
        }
        var nodeNameEnd = nodeName.search(/\.|#|$/);
        var cssArgs = nodeName.substring(nodeNameEnd);
        nodeName = nodeName.substring(0, nodeNameEnd);
        
        if (nodeName === "") nodeName = "div";
        
        args = args
                .replace(/([a-z0-9_\u00C0-\u024F-]+)\s*=([^"' ]+)/g, "#{(typeof $2 === 'undefined') ? '' : '$1=\"' + $2 + '\"'}")
                .replace(/([a-z0-9_\u00C0-\u024F-]+)\s*="#{(true|false)}"/g, "$1=\"$1\"");
        
        var allArgsArr = [args];
        var className = [];
        
        if (cssArgs !== "") {
            var idMatch = cssArgs.match(/#([^\s.#]+)/);
            if (idMatch !== null) allArgsArr.push("id=\"" + idMatch[1] + "\"");
            
            var classMatch = cssArgs.match(/\.([^\s.#]+)/g);
            if (classMatch !== null) {
                for (var i = 0; i < classMatch.length; i++) {
                    className.push(classMatch[i].substring(1));
                }
                allArgsArr.push("class=\"" + className.join(" ") + "\"");
            }
        }
        
        return new Variable({nodeName: nodeName, args: allArgsArr.join(" ")}, T_HTML_NODE);
    }


    /**
     * @param {SimpleNode} parsedTree
     * @param {PartsCombinator} combinator
     * @param {boolean?} isInComment
     * @param {boolean?} breakAllStrings
     */
    function makeParts(parsedTree, combinator, isInComment, breakAllStrings) {
        var content = parsedTree.content;
        var children = parsedTree.children || [];
        
        var i;
        
        if (content === null) {
            for (i = 0; i < children.length; i++) {
                makeParts(children[i], combinator, isInComment, breakAllStrings);
            }
        } else switch (content.type) {
            case T_STRING:
                combinator.addMany(stringSplitter(content.val));
                if (breakAllStrings) combinator.add("\n", T_FINAL_STRING);
                return;
            case T_FINAL_STRING:
                combinator.add(content.val, T_FINAL_STRING);
                if (breakAllStrings) combinator.add("\n", T_FINAL_STRING);
                return;
            case T_HTML_NODE:
                var nodeNameLC = content.val.nodeName.toLowerCase();
                
                if (selfClosingNodes[nodeNameLC]) {
                    if (content.val.args.length > 0) {
                        combinator.add("<" + nodeNameLC + " ", T_FINAL_STRING);
                        combinator.addMany(stringSplitter(content.val.args));
                        combinator.add("/>\n", T_FINAL_STRING);
                    } else {
                        combinator.add("<" + nodeNameLC + "/>\n", T_FINAL_STRING);
                    }
                } else if (children.length > 1 || (children[0] && children[0].children)) {
                    if (content.val.args && content.val.args.length > 0) {
                        combinator.add("<" + nodeNameLC + " ", T_FINAL_STRING);
                        combinator.addMany(stringSplitter(content.val.args));
                        combinator.add(">\n", T_FINAL_STRING);
                    } else {
                        combinator.add("<" + nodeNameLC + ">\n", T_FINAL_STRING);
                    }
                    for (i = 0; i < children.length; i++) {
                        makeParts(children[i], combinator, isInComment, true);
                    }
                    combinator.add("</" + nodeNameLC + ">\n", T_FINAL_STRING);
                } else {
                    if (content.val.args && content.val.args.length > 0) {
                        combinator.add("<" + nodeNameLC + " ", T_FINAL_STRING);
                        combinator.addMany(stringSplitter(content.val.args));
                        combinator.add(">", T_FINAL_STRING);
                    } else {
                        combinator.add("<" + nodeNameLC + ">", T_FINAL_STRING);
                    }
                    for (i = 0; i < children.length; i++) {
                        makeParts(children[i], combinator, isInComment);
                    }
                    combinator.add("</" + nodeNameLC + ">\n", T_FINAL_STRING);
                }
                return;
            case T_HTML_COMMENT:
                if (!isInComment) {
                    if (children.length > 1) {
                        combinator.add("<!--\n", T_FINAL_STRING);
                        for (i = 0; i < children.length; i++) {
                            makeParts(children[i], combinator, true, true);
                        }
                        combinator.add("-->\n", T_FINAL_STRING);
                    } else {
                        combinator.add("<!-- ", T_FINAL_STRING);
                        for (i = 0; i < children.length; i++) {
                            makeParts(children[i], combinator, true);
                        }
                        combinator.add(" -->\n", T_FINAL_STRING);
                    }
                } else {
                    if (children.length > 1) {
                        combinator.add("/*\n", T_FINAL_STRING);
                        for (i = 0; i < children.length; i++) {
                            makeParts(children[i], combinator, true, true);
                        }
                        combinator.add("*/\n", T_FINAL_STRING);
                    } else {
                        combinator.add("/* ", T_FINAL_STRING);
                        for (i = 0; i < children.length; i++) {
                            makeParts(children[i], combinator, true);
                        }
                        combinator.add(" */\n", T_FINAL_STRING);
                    }
                }
                return;
            case T_VARIABLE_JS:
            case T_VARIABLE_JS_ESC:
                combinator.add(content.val, content.type);
                for (i = 0; i < children.length; i++) {
                    makeParts(children[i], combinator, isInComment);
                }
                return;
            case T_INJECTED_JS:
                if (children.length > 0) {
                    combinator.add(content.val + " {", T_INJECTED_JS);
                    for (i = 0; i < children.length; i++) {
                        makeParts(children[i], combinator, isInComment);
                    }
                    combinator.add("}", T_INJECTED_JS);
                } else {
                    combinator.add(content.val, T_INJECTED_JS);
                }
                return;
            default:
                throw new Error("Internal error: Invalid node type " + content.type);
        }
    }


    /**
     * @param {string} string
     * @return {Array.<Variable>}
     */
    function stringSplitter(string) {
        var res = [];
        var pos = 0, posBefore, endPos;
        
        while (pos <= string.length) {
            posBefore = pos;
            pos = string.indexOf("#{", posBefore);
            if (pos !== -1) {
                if (posBefore !== pos) {
                    res.push(new Variable(string.substring(posBefore, pos), T_FINAL_STRING));
                }
                pos += 2;
                endPos = string.indexOf("}", pos);
                if (endPos === -1) {
                    res.push(new Variable(string.substring(pos), T_VARIABLE_JS_ESC));
                    return res;
                } else {
                    res.push(new Variable(string.substring(pos, endPos), T_VARIABLE_JS_ESC));
                    pos = endPos + 1;
                }
            } else {
                pos = string.indexOf("!{", posBefore);
                if (pos !== -1) {
                    if (posBefore !== pos) {
                        res.push(new Variable(string.substring(posBefore, pos), T_FINAL_STRING));
                    }
                    pos += 2;
                    endPos = string.indexOf("}", pos);
                    if (endPos === -1) {
                        res.push(new Variable(string.substring(pos), T_VARIABLE_JS));
                        return res;
                    } else {
                        res.push(new Variable(string.substring(pos, endPos), T_VARIABLE_JS));
                        pos = endPos + 1;
                    }
                } else {
                    res.push(new Variable(string.substring(posBefore), T_FINAL_STRING));
                    return res;
                }
            }
        }
    }



    ////////////////////////////////     MODULE     ////////////////////////////////

    function compile(str) {
        if (!str && str !== "") throw new Error("No string was given for compilation");
        
        var combinator = new PartsCombinator();
        makeParts(_parse(str), combinator, false, true);
        var res = combinator.createFunction();
        try {
            eval(res);
        } catch (e) {
            throw new Error("Invalid javascript in Jade template (" + e + ")");
        }
        // noinspection JSUnresolvedVariable
        return anonymous;
    }

    function parse(templateFunc, context) {
        if (typeof templateFunc === "string") templateFunc = compile(null, templateFunc);
        return templateFunc(context);
    }

    return {
        compile: compile,
        parse: parse,
        escapeHtml: escapeHtml,
        addSlashes: addSlashes,
        objectToCssString: objectToCssString
    };
    
})();