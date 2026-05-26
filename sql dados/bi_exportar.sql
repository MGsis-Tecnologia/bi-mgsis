DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, viewname
        FROM pg_views
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'COPY (SELECT * FROM %I.%I) TO %L CSV HEADER',
            r.schemaname,
            r.viewname,
            '/dados/drive_f/bi/' || r.viewname || '.csv'
        );
    END LOOP;
END $$;