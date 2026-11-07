Mounted over /docker-entrypoint-initdb.d by docker-compose.box.yml.

The box lab is filled by a restore of the trailslab dump (lab.sh restore),
which brings its own schema. The initdb/*.sql files in tools/trailslab would
create the same tables first, and pg_restore would then trip over them, so on
the box the image's first start creates only an empty database. A lab with no
dump at all gets its schema from `lab.sh init-schema`.

The image's entrypoint runs only *.sql, *.sql.gz and *.sh files and ignores
this one.
