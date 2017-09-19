# fastjade
Jade is one of the slowest template engines for Node.js. My implementation **pre-compiles** jade templates and should be a lot faster. However, I haven't tested it yet.

Here is a simple jade template:

```jade
// Create variables
title = "Hello World!"
injected = true
!!! 5
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
function anonymous(ctx) {
  with (ctx || {}) {
    var _ = "";
    _ += "<!-- Create variables -->";
    var title = "Hello World!";
    var injected = true;
    _ += "<!DOCTYPE html><html><head><title>";
    _ += title;
    _ += "</title><meta charset=\"utf-8\"></head><body><h1>";
    _ += escapeHtml( title);
    _ += "</h1><p class=\"big\">A paragraph with a ";
    _ += escapeHtml(injected);
    _ += " value. More text</p></body></html>";
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

##Installation

This project is not yet available on npm. However, you can install it by copying the file `fast-jade.js` onto your server and including it in your file:

```javascript
var fastJade = require('./fast-jade.js');
```

Then you can use it:

```javascript
// Pre-compile all files in a directory to access them later:
fastJade.compileDirectory('jade-views');

// Or pre-compile a string and cache it with the name "index".
// The next time a string with the same name is compiled,
// The existing template function is used instead.
fastJade.compile("!!! 5\nhtml\n  head", "index");

// Parse a pre-compiled string:
// The second argument is an object with values that can be
// accessed in the template.
var html = fastJade.parse("index", {
  title: "Home"
});

// Use it in express.js:
app.use('/help', function(req, res) {
  res.send(fastJade.parse("index", {
    title: "Help"
  }));
});

```

##Known issues

  * Javascript-like constructs (`if/else`, `each`, `case`) don't work, but can be realized with actual javascript
  * The compiler behaves differently than *jade* when indentation is imperfect:
    ```jade
    div
       p Hello
      p World    <- In jade, this <p> is not inside the <div>
    ```
  * Single quotes for html attributes like `html(lang='en')` are not allowed
  * Boolean attributes `input(checked=true)` don't work since fast-jade thinks that `true` is a variable
  * Self-closing tags don't end with a slash (`<br>` instead of `<br/>`), which is wrong in XML
  * Style attributes can't be entered as JSON: `a(style={color: 'red', background: 'green'})`
  * No conditions in attributes: `a(class={active: currentUrl === '/'} href='/') Home`
  * `&attributes` is not supported
  * Multi-line javascript is not supported
  * Invisible comments `//-` are not supported
