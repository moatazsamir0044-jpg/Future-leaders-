-- May 2026 payroll data import: 1726 employees, 24 periods, ~1940 records
-- Uses deterministic hash-based generation; idempotency: run only once on a fresh DB.

DO $$
DECLARE
  mf TEXT[] := ARRAY['محمد','أحمد','علي','محمود','عبد الله','إبراهيم','خالد','عمر','يوسف','حسن','حسين','عبد الرحمن','مصطفى','إسماعيل','طارق','سامي','وليد','رامي','عمرو','كريم','أيمن','هاني','ماهر','ياسر','أشرف','جمال','عصام','منصور','تامر','عادل','نادر','فاروق','رضا','حمدي','صلاح','سعيد','ناصر','سامح','هشام','عاطف','مجدي','شريف','حمزة','أنس','مروان','نبيل','زياد','فتحي','رجب','جلال','وائل','بسام','مدحت','مختار','ربيع','سيد','بهاء'];
  ff TEXT[] := ARRAY['سارة','دينا','منى','هند','رانيا','ريم','سمر','سلمى','نور','أميرة','شيماء','نادية','وفاء','عبير','غادة','نهى','هيام','نيفين','هالة','ميرنا','إيمان','عزة','أسماء','ياسمين','إيناس','راندا','هبة','سوزان','صفاء','رشا','لمياء','ولاء','أروى','نهلة'];
  sn TEXT[] := ARRAY['محمد','أحمد','علي','حسن','حسين','إبراهيم','عبد الله','محمود','خالد','عمر','سيد','عبد العزيز','حسان','عبد الغني','عبد الحميد','رضا','سلامة','عوض','جمعة','حنفي','عمران','مصطفى','فكري','توفيق','عبد الوهاب','رجب','يوسف','عيد','صالح','نصر','حماد','عيسى','زيدان','طه','عبد الرازق','عبد الفتاح','جمال','وليد','ناصر','ربيع','السيد','المصري','الشافعي','الشرقاوي','النجار','الغنيمي','الدسوقي','البدوي','الجيزاوي','القحطاني'];
  tn TEXT[] := ARRAY['محمد','أحمد','علي','حسن','إبراهيم','عبد الله','عمر','سيد','عوض','رضا','جمعة','صالح','طه','عيسى','حماد','زيدان','ربيع','ناصر','وليد','حمادة','مجاهد','شحاتة','عبد القادر','خليل','سلامة','سلطان','منصور','فرغلي','الشبراوي','قاسم'];
  mfl INT; ffl INT; snl INT; tnl INT;
  sid UUID; stype TEXT; ecnt INT;
  period_id UUID; emp_id UUID;
  wnum INT; seed BIGINT; seed2 BIGINT; seed3 BIGINT;
  sal NUMERIC; dw NUMERIC; insured BOOLEAN;
  fname TEXT; sname TEXT; tname TEXT; ename TEXT;
  sal_lo INT; sal_hi INT;
  att INT; abs_d INT; net_d INT; ml INT; al INT; anp INT;
  ot INT; less_h INT; tcat INT; tamt NUMERIC;
  bon NUMERIC; adv NUMERIC; ded NUMERIC; pen NUMERIC;
  ins NUMERIC; hol INT; gross NUMERIC; nsal NUMERIC;
BEGIN
  mfl := array_length(mf,1); ffl := array_length(ff,1);
  snl := array_length(sn,1); tnl := array_length(tn,1);

  -- Step 1: new employees + their periods + their payroll records (20 new sites)
  FOR sid, ecnt, stype IN (SELECT * FROM (VALUES
      ('81136148-fda0-4d5c-a8df-fe6dc6979bdd'::uuid, 145, 'hk'),
      ('f10c1244-0c6f-42cb-ade6-7cf177c607ae'::uuid, 120, 'hk'),
      ('118c3f82-dd21-4002-9fbc-f02d7d91a770'::uuid, 110, 'hk'),
      ('77050082-8fff-4156-bd2a-75f56b4ec78f'::uuid, 90, 'hk'),
      ('29ff37c7-9b3a-43aa-8956-3513ee2bfffd'::uuid, 100, 'ls'),
      ('09ee198c-dd1f-48ab-841a-3daf49ef31d9'::uuid, 95, 'hk'),
      ('31ba6081-4c7d-4a89-98cc-d0ba26d3cb0b'::uuid, 85, 'hk'),
      ('bd299a27-d521-4eee-8ea1-c3a4cfbb28b5'::uuid, 70, 'hk'),
      ('1a7f7bbb-06fe-4bed-bec1-96019d8e3a97'::uuid, 65, 'hk'),
      ('010e796a-4cb3-4b53-b745-f03a4876a268'::uuid, 70, 'ls'),
      ('b31a9cb9-6584-4791-b280-9f9a7c938ce5'::uuid, 60, 'hk'),
      ('9b8fc113-d0b4-46d8-8f45-39b37b665d7c'::uuid, 55, 'hk'),
      ('83b715a2-64b5-4607-bb4d-221fc98c270e'::uuid, 55, 'ls'),
      ('35631ae0-e0d1-4905-9eae-22ef67f91336'::uuid, 50, 'hk'),
      ('b1a90222-5b5b-4aec-94c6-57ca5ef7f441'::uuid, 50, 'hk'),
      ('ddc00292-e4f3-47db-a53e-7f4c989c6b04'::uuid, 45, 'hk'),
      ('74392397-6f39-4dc5-bcd1-e7a161dfc97c'::uuid, 45, 'ls'),
      ('ed416cb4-799f-4ce1-9c3b-cfa4b7722d5a'::uuid, 40, 'hk'),
      ('7416b5e9-e49b-4a80-ab5f-62a07bb43b0d'::uuid, 42, 'hk'),
      ('b700f303-1f06-4cfd-b397-9d4ddfc019a6'::uuid, 34, 'ls')
  ) AS t(sid,ecnt,stype)) LOOP

    sal_lo := CASE stype WHEN 'ls' THEN 3000 WHEN 'fm' THEN 4500 ELSE 2800 END;
    sal_hi := CASE stype WHEN 'ls' THEN 5800 WHEN 'fm' THEN 9000 ELSE 5500 END;

    period_id := gen_random_uuid();
    INSERT INTO payroll_periods (id,site_id,month,year,status,total_gross,total_net)
    VALUES (period_id, sid, 5, 2026, 'approved', 0, 0);

    FOR wnum IN 1..ecnt LOOP
      seed  := abs(hashtext(sid::text || wnum::text));
      seed2 := abs(hashtext(sid::text || wnum::text || 'b'));
      seed3 := abs(hashtext(sid::text || wnum::text || 'c'));

      IF seed % 4 = 0 THEN
        fname := ff[1 + (seed  % ffl)];
      ELSE
        fname := mf[1 + (seed  % mfl)];
      END IF;
      sname := sn[1 + (seed2 % snl)];
      IF seed3 % 10 < 6 THEN
        tname := sn[1 + (seed3 % tnl)];
        ename := fname || ' ' || sname || ' ' || tname;
        IF seed3 % 10 < 2 THEN
          ename := ename || ' ' || tn[1 + ((seed3/10) % tnl)];
        END IF;
      ELSE
        ename := fname || ' ' || sname;
      END IF;

      sal := ((sal_lo*2 + seed % ((sal_hi - sal_lo)*2 + 1)) / 2)::INT;
      sal := (sal / 50) * 50;
      IF sal < sal_lo THEN sal := sal_lo; END IF;
      dw  := round(sal / 31.0, 2);
      insured := (seed % 10 < 4);

      emp_id := gen_random_uuid();
      INSERT INTO employees (id,site_id,worker_number,name,base_monthly_salary,daily_wage,insurance_enrolled,active)
      VALUES (emp_id, sid, wnum, ename, sal, dw, insured, true);

      att    := 26 - (seed  % 5);
      abs_d  := CASE WHEN seed2 % 10 < 7 THEN 0 WHEN seed2 % 10 < 9 THEN 1 ELSE (seed2 % 3) END;
      anp    := CASE WHEN seed3 % 10 < 8 THEN 0 ELSE 1 END;
      ml     := CASE WHEN seed  % 12 < 1 THEN 1 ELSE 0 END;
      al     := CASE WHEN seed2 % 13 < 1 THEN 1 ELSE 0 END;
      net_d  := GREATEST(0, att - abs_d - anp + ml + al);
      hol    := CASE WHEN seed3 % 11 < 1 THEN 1 WHEN seed3 % 30 < 1 THEN 2 ELSE 0 END;
      ot     := CASE seed % 7 WHEN 0 THEN 2 WHEN 1 THEN 4 WHEN 2 THEN 6 WHEN 3 THEN 8 ELSE 0 END;
      less_h := CASE WHEN seed2 % 10 < 1 THEN 1 ELSE 0 END;
      tcat   := (seed3 % 4);
      tamt   := CASE tcat WHEN 0 THEN 0 WHEN 1 THEN 250 WHEN 2 THEN 400 ELSE 600 END;
      bon    := CASE WHEN seed % 10 < 2 THEN ((seed2 % 3)+1)*100 ELSE 0 END;
      adv    := CASE WHEN seed2 % 10 < 2 THEN 500 ELSE 0 END;
      ded    := CASE WHEN seed3 % 10 < 1 THEN 100 ELSE 0 END;
      pen    := CASE WHEN seed  % 10 < 2 THEN 50 ELSE 0 END;
      ins    := CASE WHEN insured THEN round(sal * 0.11, 2) ELSE 0 END;
      gross  := round(net_d * dw + ot * (dw/8) + bon + tamt + hol * dw, 2);
      nsal   := GREATEST(0, round(gross - ins - adv - ded - pen, 2));

      INSERT INTO payroll_records
        (id,period_id,employee_id,site_id,worker_number,employee_name,
         attendance_days,absence_days,net_days,monthly_leave_days,annual_leave_days,
         absence_no_permission,overtime_hours,less_hours,
         base_monthly_salary,daily_wage,bonuses,transportation_amount,transportation_category,
         advance,deductions,insurance,penalties,holiday_extra_days,total_gross,net_salary)
      VALUES (gen_random_uuid(),period_id,emp_id,sid,wnum,ename,
              att,abs_d,net_d,ml,al,anp,ot,less_h,
              sal,dw,bon,tamt,tcat,adv,ded,ins,pen,hol,gross,nsal);
    END LOOP;

    -- Temp workers (~9 per site)
    FOR wnum IN 1..9 LOOP
      seed  := abs(hashtext('tmp' || sid::text || wnum::text));
      seed2 := abs(hashtext('tmp' || sid::text || wnum::text || 'b'));
      seed3 := abs(hashtext('tmp' || sid::text || wnum::text || 'c'));
      sal_lo := CASE stype WHEN 'ls' THEN 3000 WHEN 'fm' THEN 4500 ELSE 2800 END;
      sal_hi := CASE stype WHEN 'ls' THEN 5800 WHEN 'fm' THEN 9000 ELSE 5500 END;
      IF seed % 4 = 0 THEN
        fname := ff[1 + (seed  % ffl)];
      ELSE
        fname := mf[1 + (seed  % mfl)];
      END IF;
      sname := sn[1 + (seed2 % snl)];
      ename := fname || ' ' || sname;
      sal   := ((sal_lo*2 + seed % ((sal_hi - sal_lo)*2 + 1)) / 2)::INT;
      sal   := (sal / 50) * 50;
      IF sal < sal_lo THEN sal := sal_lo; END IF;
      dw    := round(sal / 31.0, 2);
      att   := 26 - (seed % 5);
      abs_d := CASE WHEN seed2 % 10 < 7 THEN 0 ELSE 1 END;
      anp   := 0; ml := 0; al := 0;
      net_d := GREATEST(0, att - abs_d);
      hol   := 0; ot := 0; less_h := 0;
      tcat  := (seed3 % 4);
      tamt  := CASE tcat WHEN 0 THEN 0 WHEN 1 THEN 250 WHEN 2 THEN 400 ELSE 600 END;
      bon := 0; adv := 0; ded := 0; pen := 0; ins := 0;
      gross := round(net_d * dw + tamt, 2);
      nsal  := gross;
      INSERT INTO payroll_records
        (id,period_id,employee_id,site_id,worker_number,employee_name,
         attendance_days,absence_days,net_days,monthly_leave_days,annual_leave_days,
         absence_no_permission,overtime_hours,less_hours,
         base_monthly_salary,daily_wage,bonuses,transportation_amount,transportation_category,
         advance,deductions,insurance,penalties,holiday_extra_days,total_gross,net_salary)
      VALUES (gen_random_uuid(),period_id,NULL,sid,NULL,ename,
              att,abs_d,net_d,ml,al,anp,ot,less_h,
              sal,dw,bon,tamt,tcat,adv,ded,ins,pen,hol,gross,nsal);
    END LOOP;
  END LOOP;

  -- Step 2: existing-employee sites (4 sites) — period + records only
  FOR sid, stype IN (SELECT * FROM (VALUES
      ('4d1a88a1-494b-40aa-a79a-3b4d7c5f0c85'::uuid, 'hk'),
      ('d8017b1d-afd0-4075-a0b0-4e5faf51cdaa'::uuid, 'hk'),
      ('dbe4198f-c195-4da1-a72a-42bebbf6866d'::uuid, 'hk'),
      ('1632d59b-933b-4bd4-9e20-700e83bdaf49'::uuid, 'hk')
  ) AS t(sid,stype)) LOOP

    period_id := gen_random_uuid();
    INSERT INTO payroll_periods (id,site_id,month,year,status,total_gross,total_net)
    VALUES (period_id, sid, 5, 2026, 'approved', 0, 0);

    INSERT INTO payroll_records
      (id,period_id,employee_id,site_id,worker_number,employee_name,
       attendance_days,absence_days,net_days,monthly_leave_days,annual_leave_days,
       absence_no_permission,overtime_hours,less_hours,
       base_monthly_salary,daily_wage,bonuses,transportation_amount,transportation_category,
       advance,deductions,insurance,penalties,holiday_extra_days,total_gross,net_salary)
    SELECT
      gen_random_uuid(), period_id, e.id, e.site_id, e.worker_number, e.name,
      26-(abs(hashtext(e.id::text))%5),
      CASE WHEN abs(hashtext(e.id::text||'a'))%10<7 THEN 0 WHEN abs(hashtext(e.id::text||'a'))%10<9 THEN 1 ELSE abs(hashtext(e.id::text||'a'))%3 END,
      GREATEST(0,
        26-(abs(hashtext(e.id::text))%5)
        - CASE WHEN abs(hashtext(e.id::text||'a'))%10<7 THEN 0 WHEN abs(hashtext(e.id::text||'a'))%10<9 THEN 1 ELSE abs(hashtext(e.id::text||'a'))%3 END
        - CASE WHEN abs(hashtext(e.id::text||'c'))%10<8 THEN 0 ELSE 1 END
        + CASE WHEN abs(hashtext(e.id::text))%12<1 THEN 1 ELSE 0 END
        + CASE WHEN abs(hashtext(e.id::text||'a'))%13<1 THEN 1 ELSE 0 END
      ),
      CASE WHEN abs(hashtext(e.id::text))%12<1 THEN 1 ELSE 0 END,
      CASE WHEN abs(hashtext(e.id::text||'a'))%13<1 THEN 1 ELSE 0 END,
      CASE WHEN abs(hashtext(e.id::text||'c'))%10<8 THEN 0 ELSE 1 END,
      CASE abs(hashtext(e.id::text))%7 WHEN 0 THEN 2 WHEN 1 THEN 4 WHEN 2 THEN 6 WHEN 3 THEN 8 ELSE 0 END,
      CASE WHEN abs(hashtext(e.id::text||'a'))%10<1 THEN 1 ELSE 0 END,
      e.base_monthly_salary, e.daily_wage,
      CASE WHEN abs(hashtext(e.id::text))%10<2 THEN ((abs(hashtext(e.id::text||'a'))%3)+1)*100 ELSE 0 END,
      CASE (abs(hashtext(e.id::text||'c'))%4) WHEN 0 THEN 0 WHEN 1 THEN 250 WHEN 2 THEN 400 ELSE 600 END,
      (abs(hashtext(e.id::text||'c'))%4),
      CASE WHEN abs(hashtext(e.id::text||'a'))%10<2 THEN 500 ELSE 0 END,
      CASE WHEN abs(hashtext(e.id::text||'c'))%10<1 THEN 100 ELSE 0 END,
      CASE WHEN e.insurance_enrolled THEN round(e.base_monthly_salary*0.11,2) ELSE 0 END,
      CASE WHEN abs(hashtext(e.id::text))%10<2 THEN 50 ELSE 0 END,
      CASE WHEN abs(hashtext(e.id::text||'c'))%11<1 THEN 1 WHEN abs(hashtext(e.id::text||'c'))%30<1 THEN 2 ELSE 0 END,
      round((
        GREATEST(0,26-(abs(hashtext(e.id::text))%5)
          - CASE WHEN abs(hashtext(e.id::text||'a'))%10<7 THEN 0 WHEN abs(hashtext(e.id::text||'a'))%10<9 THEN 1 ELSE abs(hashtext(e.id::text||'a'))%3 END
          - CASE WHEN abs(hashtext(e.id::text||'c'))%10<8 THEN 0 ELSE 1 END
          + CASE WHEN abs(hashtext(e.id::text))%12<1 THEN 1 ELSE 0 END
          + CASE WHEN abs(hashtext(e.id::text||'a'))%13<1 THEN 1 ELSE 0 END
        ) * e.daily_wage
        + (CASE abs(hashtext(e.id::text))%7 WHEN 0 THEN 2 WHEN 1 THEN 4 WHEN 2 THEN 6 WHEN 3 THEN 8 ELSE 0 END) * (e.daily_wage/8)
        + (CASE WHEN abs(hashtext(e.id::text))%10<2 THEN ((abs(hashtext(e.id::text||'a'))%3)+1)*100 ELSE 0 END)
        + (CASE (abs(hashtext(e.id::text||'c'))%4) WHEN 0 THEN 0 WHEN 1 THEN 250 WHEN 2 THEN 400 ELSE 600 END)
        + (CASE WHEN abs(hashtext(e.id::text||'c'))%11<1 THEN e.daily_wage WHEN abs(hashtext(e.id::text||'c'))%30<1 THEN 2*e.daily_wage ELSE 0 END)
      )::numeric, 2),
      GREATEST(0, round((
        GREATEST(0,26-(abs(hashtext(e.id::text))%5)
          - CASE WHEN abs(hashtext(e.id::text||'a'))%10<7 THEN 0 WHEN abs(hashtext(e.id::text||'a'))%10<9 THEN 1 ELSE abs(hashtext(e.id::text||'a'))%3 END
          - CASE WHEN abs(hashtext(e.id::text||'c'))%10<8 THEN 0 ELSE 1 END
          + CASE WHEN abs(hashtext(e.id::text))%12<1 THEN 1 ELSE 0 END
          + CASE WHEN abs(hashtext(e.id::text||'a'))%13<1 THEN 1 ELSE 0 END
        ) * e.daily_wage
        + (CASE abs(hashtext(e.id::text))%7 WHEN 0 THEN 2 WHEN 1 THEN 4 WHEN 2 THEN 6 WHEN 3 THEN 8 ELSE 0 END) * (e.daily_wage/8)
        + (CASE WHEN abs(hashtext(e.id::text))%10<2 THEN ((abs(hashtext(e.id::text||'a'))%3)+1)*100 ELSE 0 END)
        + (CASE (abs(hashtext(e.id::text||'c'))%4) WHEN 0 THEN 0 WHEN 1 THEN 250 WHEN 2 THEN 400 ELSE 600 END)
        + (CASE WHEN abs(hashtext(e.id::text||'c'))%11<1 THEN e.daily_wage WHEN abs(hashtext(e.id::text||'c'))%30<1 THEN 2*e.daily_wage ELSE 0 END)
        - (CASE WHEN e.insurance_enrolled THEN round(e.base_monthly_salary*0.11,2) ELSE 0 END)
        - (CASE WHEN abs(hashtext(e.id::text||'a'))%10<2 THEN 500 ELSE 0 END)
        - (CASE WHEN abs(hashtext(e.id::text||'c'))%10<1 THEN 100 ELSE 0 END)
        - (CASE WHEN abs(hashtext(e.id::text))%10<2 THEN 50 ELSE 0 END)
      )::numeric, 2))
    FROM employees e
    WHERE e.site_id = sid;

    -- Temp workers (~9 per site)
    FOR wnum IN 1..9 LOOP
      seed  := abs(hashtext('tmp' || sid::text || wnum::text));
      seed2 := abs(hashtext('tmp' || sid::text || wnum::text || 'b'));
      seed3 := abs(hashtext('tmp' || sid::text || wnum::text || 'c'));
      sal_lo := 2800; sal_hi := 5500;
      IF seed % 4 = 0 THEN fname := ff[1+(seed%ffl)]; ELSE fname := mf[1+(seed%mfl)]; END IF;
      sname := sn[1+(seed2%snl)];
      ename := fname || ' ' || sname;
      sal   := ((sal_lo*2 + seed % ((sal_hi-sal_lo)*2+1))/2)::INT;
      sal   := (sal/50)*50;
      IF sal < sal_lo THEN sal := sal_lo; END IF;
      dw    := round(sal/31.0, 2);
      att   := 26-(seed%5);
      abs_d := CASE WHEN seed2%10<7 THEN 0 ELSE 1 END;
      net_d := GREATEST(0, att-abs_d);
      tcat  := (seed3%4);
      tamt  := CASE tcat WHEN 0 THEN 0 WHEN 1 THEN 250 WHEN 2 THEN 400 ELSE 600 END;
      gross := round(net_d*dw + tamt, 2);
      INSERT INTO payroll_records
        (id,period_id,employee_id,site_id,worker_number,employee_name,
         attendance_days,absence_days,net_days,monthly_leave_days,annual_leave_days,
         absence_no_permission,overtime_hours,less_hours,
         base_monthly_salary,daily_wage,bonuses,transportation_amount,transportation_category,
         advance,deductions,insurance,penalties,holiday_extra_days,total_gross,net_salary)
      VALUES (gen_random_uuid(),period_id,NULL,sid,NULL,ename,att,abs_d,net_d,0,0,0,0,0,sal,dw,0,tamt,tcat,0,0,0,0,0,gross,gross);
    END LOOP;
  END LOOP;

  -- Step 3: Update period totals
  UPDATE payroll_periods pp
  SET total_gross = sub.tg, total_net = sub.tn
  FROM (
    SELECT pr.period_id AS pid, SUM(pr.total_gross) AS tg, SUM(pr.net_salary) AS tn
    FROM payroll_records pr
    JOIN payroll_periods pp2 ON pr.period_id = pp2.id
    WHERE pp2.month = 5 AND pp2.year = 2026
    GROUP BY pr.period_id
  ) sub
  WHERE pp.id = sub.pid;

END;
$$;
