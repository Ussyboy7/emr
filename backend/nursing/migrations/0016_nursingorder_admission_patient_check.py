from django.db import migrations


class Migration(migrations.Migration):
    """
    Enforce nursing order patient matches linked admission patient.

    PostgreSQL CHECK constraints cannot reference other tables; use a trigger instead.
    """

    dependencies = [
        ('nursing', '0015_cancel_orphan_test_dressing_orders'),
        ('wards', '0011_backfill_admitting_doctor'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE FUNCTION nursing_order_admission_patient_match()
            RETURNS trigger AS $$
            BEGIN
              IF NEW.admission_id IS NOT NULL THEN
                IF NOT EXISTS (
                  SELECT 1
                  FROM patient_admissions
                  WHERE id = NEW.admission_id
                    AND patient_id = NEW.patient_id
                ) THEN
                  RAISE EXCEPTION 'nursing_order_admission_patient_mismatch';
                END IF;
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS nursing_order_admission_patient_match_trg ON nursing_orders;

            CREATE TRIGGER nursing_order_admission_patient_match_trg
            BEFORE INSERT OR UPDATE OF admission_id, patient_id ON nursing_orders
            FOR EACH ROW
            EXECUTE PROCEDURE nursing_order_admission_patient_match();
            """,
            reverse_sql="""
            DROP TRIGGER IF EXISTS nursing_order_admission_patient_match_trg ON nursing_orders;
            DROP FUNCTION IF EXISTS nursing_order_admission_patient_match();
            """,
        ),
    ]
