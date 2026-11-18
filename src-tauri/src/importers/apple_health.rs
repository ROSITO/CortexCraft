use crate::vault::ImportResult;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::collections::BTreeMap;
use std::fs;
use std::io::BufReader;
use std::path::Path;

#[derive(Default)]
struct DayAgg {
    steps: f64,
    hr_sum: f64,
    hr_n: u32,
    sleep_spans: Vec<(f64, f64)>,
    active_kcal: f64,
}

fn day_key(start: &str) -> Option<String> {
    // "2024-01-15 08:00:00 +0100" or ISO — require YYYY-MM-DD
    let key: String = start.chars().take(10).collect();
    let b = key.as_bytes();
    if b.len() == 10
        && b[0].is_ascii_digit()
        && b[1].is_ascii_digit()
        && b[2].is_ascii_digit()
        && b[3].is_ascii_digit()
        && b[4] == b'-'
        && b[5].is_ascii_digit()
        && b[6].is_ascii_digit()
        && b[7] == b'-'
        && b[8].is_ascii_digit()
        && b[9].is_ascii_digit()
    {
        Some(key)
    } else {
        None
    }
}

fn parse_apple_ts(s: &str) -> Option<f64> {
    // "2024-01-15 08:00:00 +0100" — treat as local wall clock seconds from a naive epoch
    let digits: String = s
        .chars()
        .filter(|c| c.is_ascii_digit())
        .take(14)
        .collect();
    if digits.len() < 14 {
        return None;
    }
    let y: f64 = digits[0..4].parse().ok()?;
    let mo: f64 = digits[4..6].parse().ok()?;
    let d: f64 = digits[6..8].parse().ok()?;
    let h: f64 = digits[8..10].parse().ok()?;
    let mi: f64 = digits[10..12].parse().ok()?;
    let se: f64 = digits[12..14].parse().ok()?;
    Some((((y * 12.0 + mo) * 31.0 + d) * 24.0 + h) * 3600.0 + mi * 60.0 + se)
}

fn merge_sleep_hours(spans: &mut [(f64, f64)]) -> f64 {
    if spans.is_empty() {
        return 0.0;
    }
    spans.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut total = 0.0;
    let mut cur_s = spans[0].0;
    let mut cur_e = spans[0].1;
    for &(s, e) in spans.iter().skip(1) {
        if s <= cur_e {
            if e > cur_e {
                cur_e = e;
            }
        } else {
            total += cur_e - cur_s;
            cur_s = s;
            cur_e = e;
        }
    }
    total += cur_e - cur_s;
    total / 3600.0
}



pub fn import_apple_health(root: &Path, export_path: &Path) -> Result<ImportResult, String> {
    if !export_path.exists() {
        return Err(format!("Health export not found: {}", export_path.display()));
    }
    // Accept export.xml or a folder containing it / zip not yet
    let xml_path = if export_path.is_dir() {
        let candidate = export_path.join("apple_health_export/export.xml");
        let candidate2 = export_path.join("export.xml");
        if candidate.exists() {
            candidate
        } else if candidate2.exists() {
            candidate2
        } else {
            return Err("Folder must contain export.xml (or apple_health_export/export.xml)".into());
        }
    } else {
        export_path.to_path_buf()
    };

    let file = fs::File::open(&xml_path).map_err(|e| e.to_string())?;
    let mut reader = Reader::from_reader(BufReader::with_capacity(1024 * 1024, file));
    reader.config_mut().trim_text(true);

    let mut days: BTreeMap<String, DayAgg> = BTreeMap::new();
    let mut buf = Vec::new();
    let mut records = 0usize;
    let mut errors = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if name != "Record" {
                    buf.clear();
                    continue;
                }
                let mut rtype = String::new();
                let mut start = String::new();
                let mut end = String::new();
                let mut value = String::new();
                for a in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(a.key.as_ref()).into_owned();
                    let val = String::from_utf8_lossy(&a.value).into_owned();
                    match key.as_str() {
                        "type" => rtype = val,
                        "startDate" => start = val,
                        "endDate" => end = val,
                        "value" => value = val,
                        _ => {}
                    }
                }
                let Some(day) = day_key(&start) else {
                    buf.clear();
                    continue;
                };
                let agg = days.entry(day).or_default();
                records += 1;
                if rtype.contains("StepCount") {
                    let v: f64 = value.parse().unwrap_or(0.0);
                    agg.steps += v;
                } else if rtype.contains("HeartRate") && !rtype.contains("Variability") {
                    let v: f64 = value.parse().unwrap_or(0.0);
                    agg.hr_sum += v;
                    agg.hr_n += 1;
                } else if rtype.contains("ActiveEnergyBurned") {
                    let v: f64 = value.parse().unwrap_or(0.0);
                    agg.active_kcal += v;
                } else if rtype.contains("SleepAnalysis") {
                    // Only explicit Asleep* (not InBed / Awake). Stages may overlap —
                    // collect spans and merge later.
                    let asleep = value.contains("Asleep") || value.contains("asleep");
                    if asleep && end.len() >= 19 && start.len() >= 19 {
                        if let (Some(s), Some(e)) = (parse_apple_ts(&start), parse_apple_ts(&end)) {
                            if e > s && (e - s) < 24.0 * 3600.0 {
                                agg.sleep_spans.push((s, e));
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                errors.push(format!("xml parse: {e}"));
                break;
            }
            _ => {}
        }
        buf.clear();
    }

    let out_folder = "Health";
    let out_dir = root.join(out_folder);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let mut imported = 0usize;
    let skipped = 0usize;

    // Index
    let index = format!(
        "---\ntitle: Apple Health import\nsource: apple-health\nkind: note\ntags: [apple-health, import, cortex]\nrecords: {records}\ndays: {}\n---\n\n# Apple Health\n\n{records} records → {} days.\n\nVoir les fiches quotidiennes dans ce dossier.\n",
        days.len(),
        days.len()
    );
    fs::write(out_dir.join("00-Index.md"), index).map_err(|e| e.to_string())?;
    imported += 1;

    for (day, agg) in &mut days {
        let dest = out_dir.join(format!("{day}.md"));
        let hr = if agg.hr_n > 0 {
            format!("{:.0}", agg.hr_sum / f64::from(agg.hr_n))
        } else {
            "—".into()
        };
        let sleep_h = merge_sleep_hours(&mut agg.sleep_spans);
        let sleep = format!("{sleep_h:.1}");
        let body = format!(
            "---\ntitle: Health {day}\nsource: apple-health\nkind: note\ndate: {day}\ntags: [apple-health, daily, import, cortex]\nsteps: {:.0}\nheart_rate_avg: {hr}\nactive_kcal: {:.0}\nsleep_hours: {sleep}\n---\n\n# Health — {day}\n\n| Metric | Value |\n|--------|-------|\n| Steps | {:.0} |\n| Heart rate avg | {hr} |\n| Active energy (kcal) | {:.0} |\n| Sleep (h) | {sleep} |\n",
            agg.steps, agg.active_kcal, agg.steps, agg.active_kcal
        );
        match fs::write(&dest, body) {
            Ok(()) => imported += 1,
            Err(e) => errors.push(e.to_string()),
        }
    }
    let _ = skipped;

    Ok(ImportResult {
        imported,
        skipped,
        folder: out_folder.into(),
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn aggregates_sample_export() {
        let dir = std::env::temp_dir().join("cortex-health-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let xml = dir.join("export.xml");
        let mut f = fs::File::create(&xml).unwrap();
        writeln!(
            f,
            r#"<?xml version="1.0"?>
<!DOCTYPE HealthData>
<HealthData>
 <Record type="HKQuantityTypeIdentifierStepCount" startDate="2024-06-01 10:00:00 +0200" value="1000" unit="count"/>
 <Record type="HKQuantityTypeIdentifierStepCount" startDate="2024-06-01 11:00:00 +0200" value="500" unit="count"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" startDate="2024-06-01 10:05:00 +0200" value="72" unit="count/min"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2024-06-01 12:00:00 +0200" value="200" unit="kcal"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2024-06-01 00:00:00 +0200" endDate="2024-06-01 07:30:00 +0200"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepREM" startDate="2024-06-01 01:00:00 +0200" endDate="2024-06-01 02:00:00 +0200"/>
</HealthData>"#
        )
        .unwrap();
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let r = import_apple_health(&vault, &xml).unwrap();
        assert!(r.imported >= 2);
        let day = fs::read_to_string(vault.join("Health/2024-06-01.md")).unwrap();
        assert!(day.contains("1500"));
        assert!(day.contains("72"));
        // Overlapping stages must merge to 7.5h, not 8.5h
        assert!(day.contains("sleep_hours: 7.5"), "{day}");
    }
}
