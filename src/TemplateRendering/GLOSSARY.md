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
A named text value derived from context available to a workflow for use in
Templates. It may be derived from Project Settings values but is not independently
supplied, stored, or directly overridden.
