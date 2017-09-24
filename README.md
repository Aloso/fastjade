# fastjade
Pug (formerly called jade) is one of the slowest template engines for Node.js. My implementation **pre-compiles** jade templates and should be a lot faster. However, I haven't tested it yet.

Fastjade has a <a href="http://aloso.bplaced.net/fastjade/">homepage</a> and a <a href="http://aloso.bplaced.net/fastjade/ide.html"><b>LIVE DEMO</b></a>!

Here is a simple pug template:

```jade
// Create variables
- var title = "Hello World!"
- var injected = true
doctype
html
  head
    title= title
    meta(charset="utf-8")
  body
    h1!= title
    p.big A paragraph with a #{injected} value. 
      | More text
```

Pre-compiling it results in a function:

```javascript
function anonymous(context) {
  with (context || {}) {
    var _ = "";
    _ += "<!-- Create variables -->\n";
    var title = "Hello World!"
    var injected = true
    _ += "<!DOCTYPE html>\n<html>\n<head>\n<title>";
    _ += (typeof title === 'undefined') ? 'undefined' : escapeHtml(title);
    _ += "</title>\n<meta charset=\"utf-8\"/>\n</head>\n<body>\n<h1>";
    _ += (typeof title === 'undefined') ? 'undefined' : title;
    _ += "</h1>\n<p class=\"big\">\nA paragraph with a ";
    _ += (typeof injected === 'undefined') ? 'undefined' : escapeHtml(injected);
    _ += " value. \nMore text\n</p>\n</body>\n</html>\n";
    return _;
  }
}
```

Executing it results in the following HTML document:

```html
<!-- Create variables -->
<!DOCTYPE html>
<html>
  <head>
    <title>Hello World!</title>
    <meta charset="utf-8">
  </head>
  <body>
    <h1>Hello World!</h1>
    <p class="big">A paragraph with a true value. More text.</p>
  </body>
</html>
```

## Installation

This project is not yet available on npm. However, you can install it by copying the 3 files `fastjade.js`, `fastjadec.js` and `time.js` onto your server.

You only have to include *either* `fastjade.js` *or* `fastjadec.js`. `fastjade.js` can only compile strings, while `fastjadec.js` can compile files and whole directories, too.

```javascript
var FastJade = require('./fastjadec.js');
```

Then you can use it:

```javascript
// Set the directory where your templates are:
FastJade.setHomeDirectory('my-templates');

// Pre-compile all files in the templates directory:
var stats = FastJade.compileDirectory('/', true);
console.log("COMPILED " + stats.total + " FILES (" + stats.duration + "ms, " + stats.success + " successful, " + stats.failed + " failed)");

// Alternatively, do it asynchronously (faster)
FastJade.compileDirectoryAsync('/', true, function (stats) {
    console.log("COMPILED " + stats.total + " FILES (" + stats.duration + "ms, " + stats.success + " successful, " + stats.failed + " failed)");
});

// Parse a pre-compiled file. All properties of the second argument
// can be accessed within the template:
var html = FastJade.parse("index", {
  title: "Home"
});

// Use it in Express.js:
app.use('/help', function(req, res) {
  res.send(FastJade.parse("help", {
    title: "Help"
  }));
});
```

## Browser version

Fastjade can run in the browser, too:

```html
<!-- at the end of the body: -->
<script type="text/javascript" src="fastjade-browser.js"></script>
<script>
    var text = "doctype\n" +
               "html\n" +
               "  head\n" +
               "    title Hello World!\n" +
               "  body\n" +
               "    h1 Hello World!";
    var html = FastJade.parse(FastJade.compile(text));
</script>
```

## Known issues

  * `extends`, `block` and `mixin` are not supported yet, but I will add it very soon. Until then, you can use `include`.
  * Javascript-like constructs (`if/else`, `unless`, `each`, `case`) don't work (yet), but can be realized with actual javascript
  * In javascript lines, some local variables of the template engine can be accessed. As a result, `_` can't be used as variable name, otherwise the script crashes.
  * Inline javascript expressions can't span multiple lines
  * Inline javascript expressions are parsed incorrectly: e.g. `#{ "}" }` won't work as the wrong brace is matched
  * Javascript expressions in HTML are not supported:
    ```jade
    //- doesn't work:
    p(style = {color: "red", "background-color": "black"})
    
    //- works:
    - var darkStyle = {color: "red", "background-color": "black"}
    p(style = darkStyle)
    ```


## Not supported yet

  * Proper indentation in the output (although this doesn't affect the html document in most cases)
  * Most filters, like `:coffee-script`, `:babel`, `:uglify-js`, `:less`, and `:markdown-it`
  * Conditions in attributes: `a(class={active: currentUrl === '/'} href='/') Home`
  * `&attributes`
  * Multi-line javascript
  * When dealing with improper indentation, fastjade behaves differently than pug

## Bugs

This is a very early release. Please do not use this template engine in production (yet) since there might be bugs. **Please report all bugs you find!** Thanks.
