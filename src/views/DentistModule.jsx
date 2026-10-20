import React, { useState, useEffect } from 'react';

export default function DentistModule({ appointments, saveToothChart, fetchPatientChart }) {
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [toothCondition, setToothCondition] = useState('Caries');
  const [notes, setNotes] = useState('');
  const [patientChart, setPatientChart] = useState([]);

  // Generate standard 32 adult tooth numbering array
  const upperTeeth = Array.from({ length: 16 }, (_, i) => i + 1);
  const lowerTeeth = Array.from({ length: 16 }, (_, i) => 32 - i);

  useEffect(() => {
    if (selectedPatient) {
      loadChart(selectedPatient);
    }
  }, [selectedPatient]);

  const loadChart = async (name) => {
    const chart = await fetchPatientChart(name);
    setPatientChart(chart);
  };

  const handleSaveTooth = async () => {
    if (!selectedPatient || !selectedTooth) return;
    await saveToothChart({
      patient_name: selectedPatient,
      tooth_number: selectedTooth,
      tooth_condition: toothCondition,
      surface: 'All',
      notes
    });
    await loadChart(selectedPatient);
    setSelectedTooth(null);
    setNotes('');
  };

  const getToothStatus = (toothNum) => {
    const record = patientChart.find(t => t.tooth_number === toothNum);
    return record ? record.tooth_condition : 'Healthy';
  };

  return (
    <div className="h-full w-full grid grid-cols-12 gap-6 overflow-hidden">
      
      {/* Left Panel: Active Queue & Diagnosis Form */}
      <div className="col-span-4 bg-white border border-[#d4e2dc] rounded-2xl p-6 flex flex-col gap-5 overflow-y-auto shadow-2xs">
        <div>
          <h3 className="font-black text-lg text-[#13241b]">Select Patient for Charting</h3>
          <select 
            value={selectedPatient} 
            onChange={e => setSelectedPatient(e.target.value)}
            className="w-full mt-2 border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold focus:outline-none"
          >
            <option value="">-- Choose Patient from Queue --</option>
            {appointments.map(a => (
              <option key={a.id} value={a.patient_name}>{a.patient_name} ({a.service_name})</option>
            ))}
          </select>
        </div>

        {selectedTooth ? (
          <div className="border border-[#d4e2dc] bg-[#f8faf9] rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-black text-sm text-[#164e43]">Editing Tooth #{selectedTooth}</span>
              <button onClick={() => setSelectedTooth(null)} className="text-xs text-red-500 font-bold">Cancel</button>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Clinical Finding</label>
              <select 
                value={toothCondition} 
                onChange={e => setToothCondition(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white font-bold"
              >
                <option value="Caries">Caries (Cavity)</option>
                <option value="Filled">Filled Restoration</option>
                <option value="Missing">Extracted / Missing</option>
                <option value="Crown">Crown / Bridge</option>
                <option value="Healthy">Healthy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Diagnosis Notes</label>
              <textarea 
                rows="3" 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="Add clinical observation details..."
                className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white focus:outline-none"
              />
            </div>

            <button 
              onClick={handleSaveTooth}
              className="w-full bg-[#164e43] text-white py-2.5 rounded-xl text-xs font-bold shadow-2xs hover:bg-[#0f362e] transition cursor-pointer"
            >
              Update Tooth Record
            </button>
          </div>
        ) : (
          <div className="border border-dashed border-[#d4e2dc] rounded-2xl p-6 text-center text-xs text-[#607368]">
            Click any tooth on the visual chart to register or edit a finding.
          </div>
        )}
      </div>

      {/* Right Panel: Interactive 32-Tooth Visual Charting Board */}
      <div className="col-span-8 bg-white border border-[#d4e2dc] rounded-2xl p-6 flex flex-col shadow-2xs overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-black text-lg text-[#13241b]">FDI Adult Dental Charting Arch</h3>
          <div className="flex gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500"></span> Caries</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Filled</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400"></span> Missing</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500"></span> Crown</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-around py-4 bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6">
          
          {/* Maxillary Arch (Upper Teeth 1-16) */}
          <div>
            <p className="text-center text-[11px] font-bold text-[#607368] mb-2 uppercase tracking-wider">Upper Arch (Maxillary)</p>
            <div className="grid grid-cols-16 gap-1.5">
              {upperTeeth.map(num => {
                const status = getToothStatus(num);
                let bg = 'bg-white border-[#d4e2dc] text-[#13241b]';
                if (status === 'Caries') bg = 'bg-red-500 text-white border-red-600';
                if (status === 'Filled') bg = 'bg-blue-500 text-white border-blue-600';
                if (status === 'Missing') bg = 'bg-gray-400 text-white border-gray-500';
                if (status === 'Crown') bg = 'bg-amber-500 text-white border-amber-600';

                return (
                  <button
                    key={num}
                    onClick={() => { setSelectedTooth(num); setToothCondition(status); }}
                    className={`h-14 rounded-xl border flex flex-col items-center justify-between p-1 font-bold text-xs transition transform hover:scale-105 cursor-pointer ${bg}`}
                  >
                    <span>{num}</span>
                    <span className="text-[9px] uppercase font-black">{status.slice(0, 3)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mandibular Arch (Lower Teeth 17-32) */}
          <div>
            <p className="text-center text-[11px] font-bold text-[#607368] mb-2 uppercase tracking-wider">Lower Arch (Mandibular)</p>
            <div className="grid grid-cols-16 gap-1.5">
              {lowerTeeth.map(num => {
                const status = getToothStatus(num);
                let bg = 'bg-white border-[#d4e2dc] text-[#13241b]';
                if (status === 'Caries') bg = 'bg-red-500 text-white border-red-600';
                if (status === 'Filled') bg = 'bg-blue-500 text-white border-blue-600';
                if (status === 'Missing') bg = 'bg-gray-400 text-white border-gray-500';
                if (status === 'Crown') bg = 'bg-amber-500 text-white border-amber-600';

                return (
                  <button
                    key={num}
                    onClick={() => { setSelectedTooth(num); setToothCondition(status); }}
                    className={`h-14 rounded-xl border flex flex-col items-center justify-between p-1 font-bold text-xs transition transform hover:scale-105 cursor-pointer ${bg}`}
                  >
                    <span className="text-[9px] uppercase font-black">{status.slice(0, 3)}</span>
                    <span>{num}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}