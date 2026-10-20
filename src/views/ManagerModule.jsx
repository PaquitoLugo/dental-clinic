import React, { useState } from 'react';

export default function ManagerModule({ services, addService, updateService, deleteService, appointments }) {
  // New service form state
  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState('Preventive');
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Preventive');
  const [editDuration, setEditDuration] = useState(30);
  const [editPrice, setEditPrice] = useState('');

  const handleAddService = async (e) => {
    e.preventDefault();
    if (!serviceName || !price) return;
    await addService({
      service_name: serviceName,
      category,
      duration_mins: parseInt(duration),
      price: parseFloat(price),
      is_active: true
    });
    setServiceName('');
    setPrice('');
  };

  const startEditing = (s) => {
    setEditingId(s.id);
    setEditName(s.service_name || s.name || '');
    setEditCategory(s.category || 'Preventive');
    setEditDuration(s.duration_mins || 30);
    setEditPrice(s.price || '');
  };

  const handleSaveEdit = async (id) => {
    await updateService(id, {
      service_name: editName,
      category: editCategory,
      duration_mins: parseInt(editDuration),
      price: parseFloat(editPrice)
    });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this service?')) {
      await deleteService(id);
    }
  };

  const totalRevenue = appointments
    ?.filter(a => a.status === 'Completed')
    ?.reduce((sum, a) => {
      const sName = a.service_name || a.name || a.title;
      const matchedService = services.find(s => (s.service_name || s.name || s.title) === sName);
      return sum + (matchedService ? parseFloat(matchedService.price || 0) : 0);
    }, 0) || 0;

  return (
    <div className="h-full w-full grid grid-cols-12 gap-6 overflow-hidden">
      
      {/* Left Column: Analytics & Add Service Form */}
      <div className="col-span-4 flex flex-col gap-6 overflow-y-auto pr-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs">
            <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Completed Revenue</p>
            <h3 className="text-2xl font-black text-[#164e43] mt-2">₱{totalRevenue.toLocaleString()}</h3>
          </div>
          <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs">
            <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Active Services</p>
            <h3 className="text-2xl font-black text-[#13241b] mt-2">{services.length}</h3>
          </div>
        </div>

        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
          <h3 className="font-black text-lg text-[#13241b] mb-4">Add Clinic Service</h3>
          <form onSubmit={handleAddService} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Service Title</label>
              <input 
                type="text" 
                required 
                value={serviceName} 
                onChange={e => setServiceName(e.target.value)} 
                placeholder="e.g. Tooth Extraction"
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#607368] mb-1">Category</label>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value)}
                  className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none"
                >
                  <option value="Preventive">Preventive</option>
                  <option value="Restorative">Restorative</option>
                  <option value="Surgery">Surgery</option>
                  <option value="Diagnostics">Diagnostics</option>
                  <option value="Cosmetic">Cosmetic</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#607368] mb-1">Price (₱)</label>
                <input 
                  type="number" 
                  required 
                  value={price} 
                  onChange={e => setPrice(e.target.value)} 
                  placeholder="1500"
                  className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
                />
              </div>
            </div>
            <button type="submit" className="w-full bg-[#164e43] text-white py-3 rounded-xl font-bold text-xs shadow-2xs hover:bg-[#0f362e] transition cursor-pointer">
              + Save Service to Catalog
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Editable Services Table */}
      <div className="col-span-8 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-lg text-[#13241b]">Manage Services & Pricing</h3>
          <span className="text-xs bg-[#e3ede6] text-[#164e43] px-3 py-1 rounded-full font-bold">Manager Access</span>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                <th className="py-3 px-2">Service Title</th>
                <th className="py-3 px-2">Category</th>
                <th className="py-3 px-2">Duration (mins)</th>
                <th className="py-3 px-2 text-right">Price (₱)</th>
                <th className="py-3 px-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f5f2] text-xs">
              {services.map(s => {
                const isEditing = editingId === s.id;
                
                return isEditing ? (
                  /* Edit Row Form */
                  <tr key={s.id} className="bg-[#f0f5f2]">
                    <td className="py-2 px-2">
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)}
                        className="w-full border border-[#d4e2dc] rounded-lg p-2 text-xs bg-white font-bold"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select 
                        value={editCategory} 
                        onChange={e => setEditCategory(e.target.value)}
                        className="border border-[#d4e2dc] rounded-lg p-2 text-xs bg-white"
                      >
                        <option value="Preventive">Preventive</option>
                        <option value="Restorative">Restorative</option>
                        <option value="Surgery">Surgery</option>
                        <option value="Diagnostics">Diagnostics</option>
                        <option value="Cosmetic">Cosmetic</option>
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input 
                        type="number" 
                        value={editDuration} 
                        onChange={e => setEditDuration(e.target.value)}
                        className="w-20 border border-[#d4e2dc] rounded-lg p-2 text-xs bg-white"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input 
                        type="number" 
                        value={editPrice} 
                        onChange={e => setEditPrice(e.target.value)}
                        className="w-24 border border-[#d4e2dc] rounded-lg p-2 text-xs bg-white text-right font-bold"
                      />
                    </td>
                    <td className="py-2 px-2 text-center space-x-2">
                      <button 
                        onClick={() => handleSaveEdit(s.id)}
                        className="bg-[#164e43] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#0f362e] transition cursor-pointer"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => setEditingId(null)}
                        className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-300 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  /* Standard Read-Only Row */
                  <tr key={s.id} className="hover:bg-[#f8faf9]">
                    <td className="py-3 px-2 font-bold text-[#13241b]">{s.service_name || s.name}</td>
                    <td className="py-3 px-2">
                      <span className="bg-[#f0f5f2] border border-[#d4e2dc] text-[#607368] px-2.5 py-0.5 rounded-md font-semibold text-[11px]">
                        {s.category}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-[#607368]">{s.duration_mins} mins</td>
                    <td className="py-3 px-2 text-right font-black text-[#164e43]">₱{parseFloat(s.price || 0).toLocaleString()}</td>
                    <td className="py-3 px-2 text-center space-x-2">
                      <button 
                        onClick={() => startEditing(s)}
                        className="text-[#164e43] hover:underline font-bold text-xs cursor-pointer"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(s.id)}
                        className="text-red-500 hover:underline font-bold text-xs cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}