var fs = require('fs');
var path = require("path");

var time = require('./time');



module.exports = {
    setHomeDirectory: setHomeDirectory,
    setFileEndingValidator: setFileEndingValidator,
    setDefaultFileEnding: setDefaultFileEnding,
    
    compile: compileFile,
    compileDirectory: compileDirectory,
    compileDirectoryAsync: compileDirectoryAsync,
    compileString: function (str) {
        return FastJade.compile(str);
    },
    isCompiled: isCompiled,
    fileHasDefaultEnding: fileHasDefaultEnding,
    getFileContent: getFileContent,
    
    parse: parse,
    compileAndParse: compileAndParse,
    compileAndParseString: compileAndParseString,
    getCompiled: getCompiled
};

var FastJade = require('./fastjade.js');

var compiledFuncs = {};

var homeDir = path.resolve("./");
var homeDirSet = false;

var fileEndingValidator = /^(jade|pug|html?|xml)$/i;
var defaultEnding = "pug";

/**
 * Set home directory of the fastjade templates relative to the project root.
 * @param {string} newHomeDir - relative path from the directory with the main file
 */
function setHomeDirectory(newHomeDir) {
    if (!homeDirSet) {
        homeDir = path.join(homeDir, newHomeDir);
        homeDirSet = true;
    } else {
        throw new Error("FastJade home directory can only be set once");
    }
}

/**
 * Define which file endings are compiled by compileDirectory().
 * You can use
 *     - a regex, like   <code>/^(pug|jade)$/i</code>
 *     - a function returning a boolean, e.g.
 * <pre>
 *     setFileEndingValidator(function(ending) {
 *         return ending === "pug"
 *     });
 * </pre>
 * @param {RegExp|{test:function(string)}} v
 */
function setFileEndingValidator(v) {
    if (typeof v === "function") {
        fileEndingValidator = {test: v};
    } else if (v instanceof RegExp || v.test) {
        fileEndingValidator = v;
    } else {
        throw new Error("File ending validator is invalid");
    }
}

/**
 * Set the default file ending for include and extend statements.
 * @param {string} e
 */
function setDefaultFileEnding(e) {
    if (typeof e === "string") {
        defaultEnding = e;
    } else {
        throw new Error("File ending has to be of type string, " + (typeof e) + " given");
    }
}

/**
 * @param {string} dirName
 * @param {boolean} rec
 * @param {RegExp} f_e_validator
 * @param {object?} result
 * @return {Object.<string, string>}
 */
function readFiles(dirName, rec, f_e_validator, result) {
    var findEndingRegex = /\.[a-z]+$/i;
    
    result || (result = {});
    
    fs.readdirSync(dirName).forEach(function (filename) {
        var absPath = path.join(dirName, filename);
        if (fs.lstatSync(absPath).isDirectory()) {
            if (rec) readFiles(absPath, true, f_e_validator, result);
        } else {
            var ending_pos = filename.search(findEndingRegex);
            var ending = ending_pos === -1 ? "" : filename.substring(ending_pos + 1);
            
            if (f_e_validator.test(ending)) {
                result[absPath] = fs.readFileSync(absPath, 'utf-8');
            }
        }
    });
    return result;
}

/**
 * @param {string} dirName
 * @param {boolean} rec
 * @param {RegExp|{test: function}} f_e_validator
 * @param {string[]?} result
 * @return {string[]}
 */
function getFileNames(dirName, rec, f_e_validator, result) {
    var findEndingRegex = /\.[a-z]+$/i;
    
    result || (result = []);
    
    fs.readdirSync(dirName).forEach(function (filename) {
        var absPath = path.join(dirName, filename);
        if (fs.lstatSync(absPath).isDirectory()) {
            if (rec) getFileNames(absPath, true, f_e_validator, result);
        } else {
            var ending_pos = filename.search(findEndingRegex);
            var ending = ending_pos === -1 ? "" : filename.substring(ending_pos + 1);
            
            if (f_e_validator.test(ending)) {
                result.push(absPath);
            }
        }
    });
    return result;
}


/**
 * @param {string} directory
 * @param {boolean?} recursive=true
 */
function compileDirectory(directory, recursive) {
    var timeStart = time.start();
    
    (recursive !== undefined) || (recursive = true);
    
    var targetDir = path.join(homeDir, directory);
    var files = readFiles(targetDir, recursive, fileEndingValidator);
    
    var finalNum = 0;
    var failed = 0;
    
    for (var filename in files) if (files.hasOwnProperty(filename)) {
        finalNum++;
    
        var newName = path.relative(homeDir, filename).replace(/\\/g, "/").replace(/\.[a-z]+$/, "");
        var fn = FastJade.compile(files[filename], newName);
        if (!(fn instanceof Error)) {
            compiledFuncs[newName] = fn;
        } else {
            console.warn("[" + newName + "] " + fn);
            failed++;
        }
    }
    
    return {
        total: finalNum,
        failed: failed,
        success: finalNum - failed,
        duration: time.end(timeStart)
    };
}


var asynchronouslyCompilingFiles = {};

/**
 * @param {string} directory
 * @param {boolean?} recursive=true
 * @param {function?} callback
 */
function compileDirectoryAsync(directory, recursive, callback) {
    var timeStart = time.start();
    
    (recursive !== undefined) || (recursive = true);
    
    var targetDir = path.join(homeDir, directory);
    var fileNames = getFileNames(targetDir, recursive, fileEndingValidator);
    
    var finalNum = 0;
    var compiledNum = 0;
    var failed = 0;
    
    var timeSum = time.endPrecise(timeStart);
    
    for (var i = 0; i < fileNames.length; i++) {
        // noinspection JSAnnotator
        let fileName = fileNames[i];
        finalNum++;
        
        fs.readFile(fileName, "utf-8", function (err, content) {
            var timeStart = time.start();
            compiledNum++;
            if (err) {
                console.warn(err);
            } else {
                var newName = path.relative(homeDir, fileName).replace(/\\/g, "/").replace(/\.[a-z]+$/, "");
                if (!compiledFuncs[newName]) {
                    var fn = FastJade.compile(content, newName);
                    if (!(fn instanceof Error)) {
                        compiledFuncs[newName] = fn;
                    } else {
                        console.warn("[" + newName + "] " + fn);
                        failed++;
                    }
                }
            }
            timeSum += time.endPrecise(timeStart);
            // noinspection JSReferencingMutableVariableFromClosure
            if (finalNum === compiledNum) {
                callback({
                    total: compiledNum,
                    failed: failed,
                    success: compiledNum - failed,
                    duration: time.round(timeSum)
                });
            }
        });
    }
}

/** @param {string} file */
function compileFile(file) {
    if (!/\.[a-z]+$/i.test(file)) file += "." + defaultEnding;
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.[a-z]+$/i, "");
    if (compiledFuncs[newName]) return compiledFuncs[newName];
    
    var b = FastJade.compile(fs.readFileSync(targetFile, 'utf-8'), newName);
    if (!(b instanceof Error)) compiledFuncs[newName] = b;
    return b;
}

/** @param {string} file */
function getFileContent(file) {
    var targetFile = path.join(homeDir, file);
    return fs.readFileSync(targetFile, 'utf-8');
}

/**
 * @param {string} file
 * @return {boolean}
 */
function fileHasDefaultEnding(file) {
    if (!/\.[a-z]+$/i.test(file)) return true;
    return file.lastIndexOf("." + defaultEnding) === file.length - defaultEnding.length - 1;
}

function getFilePath(file) {
    if (!/\.[a-z]+$/i.test(file)) file += "." + defaultEnding;
    var targetFile = path.join(homeDir, file);
    
}

function isCompiled(file) {
    if (!/\.[a-z]+$/i.test(file)) file += "." + defaultEnding;
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.[a-z]+$/i, "");
    return !!compiledFuncs[newName];
}

/**
 * @param {string|function} file
 * @param {Object} context
 * @return {string|Error}
 */
function parse(file, context) {
    if (typeof file === "function") {
        return FastJade.parse(file, context);
    }
    
    if (!/\.[a-z]+$/i.test(file)) file += "." + defaultEnding;
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.[a-z]+$/i, "");
    
    if (compiledFuncs[newName]) {
        return FastJade.parse(compiledFuncs[newName], context);
    } else {
        throw new Error("No compiled version of the file available");
    }
}

/**
 * @param {string} file
 * @param {Object} context
 * @return {string|Error}
 */
function compileAndParse(file, context) {
    if (typeof file === "function") {
        return parse(file, callback);
    }
    var b = compileFile(file);
    if (!(b instanceof Error)) {
        return parse(file, context);
    } else {
        return b;
    }
}

/**
 * @param {string} str
 * @param {Object?} context
 * @return {string|Error}
 */
function compileAndParseString(str, context) {
    var b = FastJade.compile(str);
    if (!(b instanceof Error)) {
        return FastJade.parse(b, context);
    } else {
        return b;
    }
}

/**
 * @param {string} file
 * @return {function|undefined}
 */
function getCompiled(file) {
    if (!/\.[a-z]+$/i.test(file)) file += "." + defaultEnding;
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.[a-z]+$/i, "");
    return compiledFuncs[newName];
}