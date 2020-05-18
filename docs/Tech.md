# Tech Decisions to Remember

## GET API structure

Since mongoose has good aggregation API for doing SQL like joins in the form of `populate()`, I feel this is the best way to expose getters for your models:

-   getOne(id, options)
-   getMany(id, query, options)

Here, in both the handlers, options has a populate flag, which if 1, the handler calls `.populate()` on the query and returns a populated document.
The query object allows to customise the search.
