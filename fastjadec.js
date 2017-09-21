var fs = require('fs');
var path = require("path");



module.exports = {
    setHomeDirectory: setHomeDirectory,
    compile: compileFile,
    compileDirectory: compileDirectory,
    compileString: function (str, callback) {
        FastJade.compile(str, callback);
    },
    isCompiled: isCompiled,
    parse: parse,
    compileAndParse: compileAndParse,
    compileAndParseString: compileAndParseString,
    getCompiled: getCompiled
};

var FastJade = require('./fastjade.js');

var compiledFuncs = {};

var homeDir = path.resolve("./");
var homeDirSet = false;

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
 * @param {string} dirName
 * @param {boolean} rec
 * @param {{balance:int, finalNum:int, failed: int}} counter
 * @param {function(string, string)} onFileContent
 * @param {function(Error)} onError
 */
function readFiles(dirName, rec, counter, onFileContent, onError) {
    fs.readdir(dirName, function(err, filenames) {
        if (err) {
            onError(err);
            return;
        }
        
        filenames.forEach(function () {
            counter.balance++;
            counter.finalNum++;
        });
        
        filenames.forEach(function(filename) {
            var absPath = path.join(dirName, filename);
            
            if (fs.lstatSync(absPath).isDirectory()) {
                counter.balance--;
                counter.finalNum--;
                if (rec) {
                    readFiles(absPath, true, counter, onFileContent, onError);
                }
            } else {
                fs.readFile(absPath, 'utf-8', function(err, content) {
                    counter.balance--;
                    if (err) {
                        counter.failed++;
                        onError(err);
                    } else {
                        onFileContent(absPath, content);
                    }
                });
            }
        });
    });
}

/**
 * @param {string} directory
 * @param {boolean?} recursive=true
 * @param {function(numOfFiles: int, failed: int)?} callback
 */
function compileDirectory(directory, recursive, callback) {
    if (typeof recursive === "function" && callback === undefined) {
        // noinspection JSValidateTypes
        callback = recursive;
        recursive = true;
    }
    // noinspection EqualityComparisonWithCoercionJS
    (recursive != null) || (recursive = true);
    
    var targetDir = path.join(homeDir, directory);
    var counter = {balance: 0, finalNum: 0, failed: 0};
    
    readFiles(targetDir, recursive, counter, function (filename, content) {
        if (/\.jade$/.test(filename)) {
            FastJade.compile(content, function (fn) {
                if (!(fn instanceof Error)) {
                    var newName = path.relative(homeDir, filename).replace(/\\/g, "/").replace(/\.jade$/, "");
                    compiledFuncs[newName] = fn;
                    if (counter.balance === 0 && callback) {
                        callback(counter.finalNum, counter.failed);
                    }
                }
            });
        }
    }, function (err) {
        if (counter.balance === 0) {
            console.error(err);
            if (callback) callback(counter.finalNum, counter.failed);
        }
    });
}

/**
 * @param {string} file
 * @param {function(function|Error)?} callback
 */
function compileFile(file, callback) {
    if (!/\.jade$/.test(file)) file += ".jade";
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.jade$/, "");
    if (compiledFuncs[newName]) {
        if (callback) callback(compiledFuncs[newName]);
    }
    
    fs.readFile(targetFile, 'utf-8', function(err, content) {
        if (err) {
            if (callback) callback(err);
            return;
        }
        
        FastJade.compile(content, function (b) {
            if (b) {
                compiledFuncs[newName] = b;
            }
            if (callback) callback(b);
        });
    });
}

function isCompiled(file) {
    if (!/\.jade$/.test(file)) file += ".jade";
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.jade$/, "");
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
    
    if (!/\.jade$/.test(file)) file += ".jade";
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.jade$/, "");
    
    if (compiledFuncs[newName]) {
        return FastJade.parse(compiledFuncs[newName], context);
    } else {
        throw new Error("No compiled version of the file available");
    }
}

/**
 * @param {string} file
 * @param {Object} context
 * @param {function} callback
 * @return {*}
 */
function compileAndParse(file, context, callback) {
    if (typeof file === "function") {
        return parse(file, callback);
    }
    compileFile(file, function (b) {
        if (b) {
            callback(parse(file, context));
        } else if (callback) {
            callback(false);
        } else {
            return false;
        }
    });
}

/**
 * @param {string} str
 * @param {Object?} context
 * @param {function?} callback
 * @return {undefined}
 */
function compileAndParseString(str, context, callback) {
    FastJade.compile(str, function (b) {
        if (!(b instanceof Error)) {
            if (callback) callback(FastJade.parse(b, context));
        } else {
            if (callback) callback(b);
        }
    });
}

/**
 * @param {string} file
 * @return {function|undefined}
 */
function getCompiled(file) {
    if (!/\.jade$/.test(file)) file += ".jade";
    var targetFile = path.join(homeDir, file);
    var newName = path.relative(homeDir, targetFile).replace(/\\/g, "/").replace(/\.jade$/, "");
    return compiledFuncs[newName];
}