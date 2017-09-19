# fastjade
Jade is one of the slowest template engines for Node.js. My implementation **pre-compiles** jade templates and should be a lot faster. However, I haven't tested it yet.

Here is a simple jade template:

```jade
// Create variables
- var title = "Hello World!"
- var injected = true
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
    var title = "Hello World!"
    var injected = true
    _ += "<!DOCTYPE html><html><head><title>";
    _ += title;
    _ += "</title><meta charset=\"utf-8\"></head><body><h1>";
    _ += escapeHtml(title);
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

## Installation

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

## Known issues

  * Javascript-like constructs (`if/else`, `unless`, `each`, `case`) don't work, but can be realized with actual javascript
  * `extends`, `block` and `include` is not supported yet, but I will add it very soon.
  * Tag names can't be omitted when a class or id is specified: `#some-id`
  * Security issue? In javascript sections, the user has access to some local variables of the template engine.
  * The variable name `_` can't be used.
  * *fast-jade* behaves differently than *jade* when indentation is imperfect:
    ```jade
    div
       p Hello
      p World    <- In jade, this <p> is not inside the <div>
    ```
  * Self-closing tags don't end with a slash (`<br>` instead of `<br/>`), which is wrong in XML

## Not supported yet

Here are some missing jade features that are less essential.

  * Filters like `:coffee-script`, `:babel`, `:uglify-js`, `:less`, and `:markdown-it`
  * Single quotes for html attributes like: `html(lang='en')`
  * Boolean html attributes without quotes: `input(checked=true)`
  * Style attributes as JSON: `a(style={color: 'red', background: 'green'})`
  * Conditions in attributes: `a(class={active: currentUrl === '/'} href='/') Home`
  * `&attributes`
  * Multi-line javascript
  * Invisible comments: `//-`

## Bugs

This is a very early release. Please do not use this template engine in production (yet) since there might be bugs. **Please report all bugs you find!** Thanks.
