# Template Rendering

Template Rendering owns the transformation of templates into content using
supplied inputs and Computed Variables. Its callers own input collection,
configuration loading, and persistence of rendered content.

## Language

**Template**:
A source document whose expressions are resolved using supplied inputs and
Computed Variables to produce Blueprint or workflow content.

**Rendered Content**:
The result of resolving a Template with the inputs supplied for one operation.
_Avoid_: Replaced template

**Variable**:
A named input supplied by the caller for use in a Template, such as a selected
project value or a workflow command's title.
_Avoid_: Setting, parameter

**Computed Variable**:
A named text value derived from a workflow's supplied inputs for use in Templates.
Its value is not supplied by the user, stored in Config, or directly overridden.
