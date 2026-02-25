# SLPE.Blazor.RichTextEditor

A lightweight Blazor rich text editor using `contenteditable` and native browser APIs. Zero third-party JavaScript dependencies.

## Installation

Add a project reference (or NuGet package when published):

```xml
<ProjectReference Include="path/to/SLPE.Blazor.RichTextEditor.csproj" />
```

Add the CSS stylesheet to your `App.razor` (or `_Host.cshtml`):

```html
<link rel="stylesheet" href="_content/SLPE.Blazor.RichTextEditor/css/rich-text-editor.css" />
```

Add the namespace to your `_Imports.razor`:

```razor
@using SLPE.Blazor.RichTextEditor
```

## Usage

```razor
<RichTextEditor @bind-Content="_html" Height="400" />

@code {
    private string _html = "<p>Hello, world!</p>";
}
```

### Getting content programmatically

Use a component reference to call `GetContentAsync()`:

```razor
<RichTextEditor @ref="_editor" @bind-Content="_html" />
<button @onclick="Save">Save</button>

@code {
    private RichTextEditor _editor = default!;
    private string _html = "";

    private async Task Save()
    {
        var content = await _editor.GetContentAsync();
        // ... save content
    }
}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `Content` | `string` | `""` | Two-way bindable HTML content |
| `ContentChanged` | `EventCallback<string>` | — | Callback fired when content changes |
| `Height` | `int` | `500` | Minimum height of the editor in pixels |
| `DebounceMs` | `int` | `300` | Debounce delay (ms) before notifying content changes |
| `UndoStackSize` | `int` | `100` | Maximum number of undo states to keep |
| `MaxTableRows` | `int` | `20` | Maximum rows allowed in table insertion dialog |
| `MaxTableColumns` | `int` | `10` | Maximum columns allowed in table insertion dialog |

## Public Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `GetContentAsync()` | `Task<string>` | Returns the current HTML content from the editor |

## Features

- **Formatting**: Bold, italic, underline, headings (H1–H4), blockquote
- **Alignment**: Left, center, right
- **Lists**: Bullet and numbered lists with indent/outdent
- **Links**: Insert dialog with URL, display text, and new-tab option
- **Tables**: Insert dialog with configurable rows and columns
- **Code view**: Toggle HTML source editing
- **Fullscreen**: Expand editor to fill the viewport (Escape to exit)
- **Undo/Redo**: Custom undo stack with keyboard shortcuts (Ctrl+Z / Ctrl+Y)
- **Paste sanitization**: Strips unsafe HTML tags and attributes on paste
- **WYSIWYG fidelity**: Editor typography matches output styling

## Theming

All colours use CSS custom properties. Override them in your application CSS:

```css
:root {
    --rte-accent: #2563eb;
    --rte-primary: #00173b;
    --rte-primary-hover: #001335;
    --rte-text: #2d3748;
    --rte-text-heading: #1a202c;
    --rte-text-muted: #6b7280;
    --rte-border: #d1d5db;
    --rte-bg: #ffffff;
    --rte-bg-toolbar: #f9fafb;
    --rte-bg-hover: #e5e7eb;
    --rte-bg-active: #dbeafe;
    --rte-bg-input: #f3f4f6;
    --rte-link: #00173b;
}
```

### Dark mode

The component responds to a `.dark` ancestor class (e.g. on `<html class="dark">`). Dark-mode variables are defined under `.dark { ... }` in the default stylesheet.

## Browser support

This editor uses `document.execCommand()`, which is technically deprecated but remains the only viable approach for contenteditable-based editing. It is supported in all modern browsers and there is no replacement API. See the [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand) for details.

## License

MIT
