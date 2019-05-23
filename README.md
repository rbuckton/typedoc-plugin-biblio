# typedoc-plugin-biblio

A plugin for [TypeDoc](https://github.com/TypeStrong/typedoc) that adds support for references to externally hosted documentation.

## Installation

```sh
npm install --save-dev typedoc typedoc-plugin-biblio
```

## Usage

The plugin provides custom links to external types through the use of a `biblio.json` file:

```sh
node_modules/.bin/typedoc --biblio biblio.json
```

The `biblio.json` file has the following format:

```json
{
    "namepath": "url",
}
```

Where `"namepath"` is a key in one of the following formats:
- `"Type"` - A reference to the global identifier `Type`.
- `"Namespace.Type"` - A reference to the identifier `Type` on the global namespace `Namespace`.
- `"module:Type"` - A reference to the identifier `Type` in external module `module`.
- `"module:Namespace.Type"` - A reference to the identifier `Type` on the namespace `Namespace` in external module `module`.


For example:

```json
{
    "Iterable": "https://tc39.github.io/ecma262/#sec-symbol.iterator",
    "Iterator": "https://tc39.github.io/ecma262/#sec-symbol.iterator",
    "foo/bar:Baz": "http://foo.bar/Baz"
}
```

## Arguments

This plugin adds the following additional arguments to TypeDoc:

### `--biblio <path>`

Provides the path to a `biblio.json` file.

## Reflection Augmentations

This plugin also augments reflections with a `urlTarget` property that can be used in themes to indicate that the reflection is documented
in an external location when `urlTarget` has the value `"external"`:

*type.hbs*:
```handlebars
...
            <a href="{{relativeURL reflection.url}}" {{#if reflection.urlTarget}}target="{{reflection.urlTarget}}"{{/if}} class="tsd-signature-type">
                {{reflection.name}}
            </a>
...
```
